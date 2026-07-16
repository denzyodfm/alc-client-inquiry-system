import sql, { ConnectionPool } from "mssql";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { Branch, LoanStatus } from "@prisma/client";

type BranchClientRow = {
  id: string | number;
  client_id?: string | null;
  full_name: string;
  birthdate?: Date | string | null;
  contact_number?: string | null;
  valid_id_number?: string | null;
  address?: string | null;
  updated_at?: Date | string | null;
};

type BranchLoanRow = {
  id: string | number;
  client_remote_id: string | number;
  loan_number?: string | null;
  loan_product?: string | null;
  co_maker_name?: string | null;
  co_maker_client_remote_id?: string | number | null;
  co_maker_contact_number?: string | null;
  co_maker_valid_id_number?: string | null;
  co_maker_address?: string | null;
  principal_amount?: string | number | null;
  interest_rate?: string | number | null;
  interest_amount?: string | number | null;
  penalty_amount?: string | number | null;
  terms?: string | null;
  paid_amount?: string | number | null;
  balance?: string | number | null;
  status?: string | number | null;
  source_status_code?: string | number | null;
  source_status_name?: string | null;
  released_at?: Date | string | null;
  maturity_at?: Date | string | null;
  updated_at?: Date | string | null;
};

type BranchAmortizationRow = {
  id: string | number;
  loan_remote_id: string | number;
  amort_no?: string | number | null;
  amort_date?: Date | string | null;
  principal_balance?: string | number | null;
  interest_balance?: string | number | null;
  principal_amort?: string | number | null;
  interest_amort?: string | number | null;
  total_amort?: string | number | null;
  paid_principal?: string | number | null;
  paid_interest?: string | number | null;
  paid_total?: string | number | null;
  paid_status?: string | number | null;
};

type BranchPaymentRow = {
  id: string | number;
  client_remote_id: string | number;
  loan_remote_id?: string | number | null;
  amount?: string | number | null;
  paid_at?: Date | string | null;
  updated_at?: Date | string | null;
};

type BranchCoMakerRow = {
  id: string | number;
  loan_remote_id: string | number;
  name: string;
  client_remote_id?: string | number | null;
  contact_number?: string | null;
  valid_id_number?: string | null;
  address?: string | null;
};

type BranchTable = "tb_loan_cif" | "tb_loan_data" | "tb_payment_history" | "tb_amort_data";
type BranchTableColumns = Partial<Record<string, Set<string>>>;
type BranchSourceTable = { schemaName: string; tableName: string; key: string };
type BranchSyncResult =
  | { branch: string; status: "SUCCESS"; clientsPulled: number; loansPulled: number; paymentsPulled: number; coMakersPulled?: number }
  | { branch: string; status: "FAILED"; message?: string }
  | { branch: string; status: "SKIPPED"; message: string };
type BranchConnection = { pool: ConnectionPool; host: string };

function asDate(value?: Date | string | null) {
  if (!value) return null;
  return new Date(value);
}

function statusToLoanStatus(value?: string | number | null, balance?: string | number | null): LoanStatus {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "10" || normalized === "12" || normalized === "CLOSED" || normalized === "PAID") {
    return "CLOSED";
  }
  if (balance !== null && balance !== undefined && Number(balance) <= 0) {
    return "PAID";
  }
  if (normalized === "5" || normalized === "WRITE-OFF" || normalized === "WRITTEN_OFF") {
    return "WRITTEN_OFF";
  }
  return "ACTIVE";
}

function asNumber(value?: string | number | null) {
  if (value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function loanBalance(principalAmount: number, interestAmount: number, penaltyAmount: number, paidAmount: number) {
  return Math.max(0, principalAmount + interestAmount + penaltyAmount - paidAmount);
}

function amortizationPaidTotal(schedule: { paidPrincipal: unknown; paidInterest: unknown }) {
  return asNumber(schedule.paidPrincipal as string | number | null) + asNumber(schedule.paidInterest as string | number | null);
}

function normalizeColumnName(value: string) {
  return value.trim().toLowerCase();
}

function bracketColumn(column: string) {
  return `[${column.replace(/]/g, "]]")}]`;
}

function bracketTableName(schemaName: string, tableName: string) {
  return `${bracketColumn(schemaName)}.${bracketColumn(tableName)}`;
}

function firstExistingColumn(columns: Set<string> | undefined, candidates: string[]) {
  if (!columns) return null;
  return candidates.find((candidate) => columns.has(normalizeColumnName(candidate))) ?? null;
}

function nullableColumnExpression(tableAlias: string, columns: Set<string> | undefined, candidates: string[], alias: string) {
  const column = firstExistingColumn(columns, candidates);
  return column
    ? `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), ${tableAlias}.${bracketColumn(column)}))), '') AS ${alias}`
    : `CAST(NULL AS NVARCHAR(255)) AS ${alias}`;
}

function nullableLoanColumnExpression(columns: Set<string> | undefined, candidates: string[], alias: string) {
  return nullableColumnExpression("loan", columns, candidates, alias);
}

function coMakerNameExpression(tableAlias: string, columns: Set<string> | undefined) {
  const directColumn = firstExistingColumn(columns, [
    "co_maker_name",
    "comaker_name",
    "co_maker",
    "comaker",
    "coborrower_name",
    "co_borrower_name",
    "guarantor_name",
    "surety_name",
    "name",
    "full_name",
    "customer_name"
  ]);
  if (directColumn) return `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), ${tableAlias}.${bracketColumn(directColumn)}))), '')`;

  const lastName = firstExistingColumn(columns, ["lname", "last_name", "lastname", "co_lname", "comaker_lname"]);
  const firstName = firstExistingColumn(columns, ["fname", "first_name", "firstname", "co_fname", "comaker_fname"]);
  const middleName = firstExistingColumn(columns, ["mi", "mname", "middle_name", "middlename", "co_mi", "comaker_mi"]);
  if (!lastName && !firstName) return null;

  const parts = [lastName, firstName, middleName]
    .filter((column): column is string => Boolean(column))
    .map((column) => `ISNULL(CONVERT(NVARCHAR(255), ${tableAlias}.${bracketColumn(column)}), '')`)
    .join(" + ' ' + ");

  return `NULLIF(LTRIM(RTRIM(${parts})), '')`;
}

function sourceTableKey(schemaName: string, tableName: string) {
  return `${schemaName}.${tableName}`.toLowerCase();
}

async function getBranchTableColumns(connection: ConnectionPool): Promise<BranchTableColumns> {
  const result = await connection.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
  `);

  return (result.recordset as Array<{ TABLE_SCHEMA: string; TABLE_NAME: string; COLUMN_NAME: string }>).reduce<BranchTableColumns>((map, row) => {
    const table = row.TABLE_NAME.toLowerCase();
    const qualifiedTable = sourceTableKey(row.TABLE_SCHEMA, row.TABLE_NAME);
    const columns = map[table] ?? new Set<string>();
    const qualifiedColumns = map[qualifiedTable] ?? new Set<string>();
    columns.add(normalizeColumnName(row.COLUMN_NAME));
    qualifiedColumns.add(normalizeColumnName(row.COLUMN_NAME));
    map[table] = columns;
    map[qualifiedTable] = qualifiedColumns;
    return map;
  }, {});
}

async function getBranchSourceTables(connection: ConnectionPool): Promise<BranchSourceTable[]> {
  const result = await connection.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);

  return (result.recordset as Array<{ TABLE_SCHEMA: string; TABLE_NAME: string }>).map((row) => ({
    schemaName: row.TABLE_SCHEMA,
    tableName: row.TABLE_NAME,
    key: sourceTableKey(row.TABLE_SCHEMA, row.TABLE_NAME)
  }));
}

function findCoMakerSourceTable(tables: BranchSourceTable[], tableColumns: BranchTableColumns) {
  const tableNamePattern = /(co_?maker|comaker|co_?borrow|coborrow|guarantor|surety)/i;
  const loanColumnCandidates = ["loan_no", "loan_number", "loan_id", "loanid", "acct_no", "account_no", "loan_remote_id"];
  const nameColumnCandidates = [
    "co_maker_name",
    "comaker_name",
    "co_maker",
    "comaker",
    "coborrower_name",
    "co_borrower_name",
    "guarantor_name",
    "surety_name",
    "name",
    "full_name",
    "customer_name",
    "lname",
    "fname"
  ];

  return tables.find((table) => {
    const columns = tableColumns[table.key] ?? tableColumns[table.tableName.toLowerCase()];
    return tableNamePattern.test(table.tableName) && firstExistingColumn(columns, loanColumnCandidates) && firstExistingColumn(columns, nameColumnCandidates);
  }) ?? null;
}

async function reconcileLoanBalancesFromAmortization(branchId: number) {
  const loans = await prisma.loan.findMany({
    where: {
      branchId,
      amortizationSchedules: { some: {} }
    },
    include: {
      amortizationSchedules: {
        select: {
          totalAmort: true,
          paidPrincipal: true,
          paidInterest: true,
          paidStatus: true
        }
      }
    }
  });

  for (const loan of loans) {
    const scheduleTotal = loan.amortizationSchedules.reduce((total, schedule) => total + Number(schedule.totalAmort), 0);
    const schedulePaid = loan.amortizationSchedules.reduce((total, schedule) => total + amortizationPaidTotal(schedule), 0);
    const allSchedulesPaid = loan.amortizationSchedules.every((schedule) => Number(schedule.paidStatus ?? 0) === 2);
    const balance = allSchedulesPaid ? 0 : Math.max(0, scheduleTotal - schedulePaid);
    const sourceStatusCode = allSchedulesPaid ? 10 : loan.sourceStatusCode ?? 0;
    const sourceStatusName = allSchedulesPaid ? "Closed" : loan.sourceStatusName ?? "Current";

    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        paidAmount: schedulePaid,
        balance,
        status: statusToLoanStatus(sourceStatusCode, balance),
        sourceStatusCode,
        sourceStatusName
      }
    });
  }
}

function parseSqlServerHost(dbHost: string) {
  const trimmed = dbHost.trim();
  const commaPortMatch = trimmed.match(/^(.+),(\d+)$/);
  const colonPortMatch = trimmed.match(/^([^:]+):(\d+)$/);

  if (commaPortMatch) {
    return { server: commaPortMatch[1], port: Number(commaPortMatch[2]) };
  }

  if (colonPortMatch) {
    return { server: colonPortMatch[1], port: Number(colonPortMatch[2]) };
  }

  return { server: trimmed, port: undefined };
}

function normalizeHostForCompare(host: string) {
  return host.trim().toLowerCase();
}

function withPrimaryPortIfMissing(host: string, primaryHost: string) {
  const parsedHost = parseSqlServerHost(host);
  const parsedPrimary = parseSqlServerHost(primaryHost);
  if (parsedHost.port || !parsedPrimary.port) return host.trim();
  return `${host.trim()},${parsedPrimary.port}`;
}

function connectionHosts(branch: Branch) {
  const primaryHost = branch.dbHost.trim();
  const dynamicIp = (branch as Branch & { dynamicIp?: string | null }).dynamicIp?.trim();
  const hosts = [primaryHost];

  if (dynamicIp) {
    const fallbackHost = withPrimaryPortIfMissing(dynamicIp, primaryHost);
    if (normalizeHostForCompare(fallbackHost) !== normalizeHostForCompare(primaryHost)) {
      hosts.push(fallbackHost);
    }
  }

  return hosts;
}

async function connectToHost(branch: Branch, dbHost: string, options?: { connectionTimeout?: number; requestTimeout?: number }) {
  const { server, port } = parseSqlServerHost(dbHost);

  const pool = new sql.ConnectionPool({
    server,
    user: branch.dbUser,
    password: decryptSecret(branch.encryptedDbPassword),
    database: branch.dbName,
    port,
    connectionTimeout: options?.connectionTimeout ?? 15000,
    requestTimeout: options?.requestTimeout ?? 60000,
    options: {
      encrypt: process.env.SQLSERVER_ENCRYPT === "true",
      trustServerCertificate: process.env.SQLSERVER_TRUST_CERT !== "false"
    }
  });

  return pool.connect();
}

async function getConnection(branch: Branch, options?: { connectionTimeout?: number; requestTimeout?: number }): Promise<BranchConnection> {
  const errors: string[] = [];

  for (const host of connectionHosts(branch)) {
    let pool: ConnectionPool | null = null;

    try {
      pool = await connectToHost(branch, host, options);
      return { pool, host };
    } catch (error) {
      await pool?.close();
      const message = error instanceof Error ? error.message : "Unable to connect.";
      errors.push(`${host}: ${message}`);
    }
  }

  throw new Error(`Unable to connect to branch database. Tried ${errors.join(" | ")}`);
}

export async function checkBranchConnection(branch: Branch) {
  let connection: ConnectionPool | null = null;

  try {
    const connected = await getConnection(branch, { connectionTimeout: 3000, requestTimeout: 5000 });
    connection = connected.pool;
    await connection.request().query("SELECT 1 AS ok");

    return {
      status: "ONLINE" as const,
      checkedAt: new Date().toISOString(),
      message: `Connection successful via ${connected.host}.`
    };
  } catch (error) {
    return {
      status: "OFFLINE" as const,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Unable to connect."
    };
  } finally {
    await connection?.close();
  }
}

async function fetchBranchRows<T>(connection: ConnectionPool, table: BranchTable, since: Date | null, tableColumns: BranchTableColumns = {}) {
  const request = connection.request();
  request.input("since", sql.DateTime2, since);
  const loanColumns = tableColumns.tb_loan_data;
  const coMakerNameExpression = nullableLoanColumnExpression(
    loanColumns,
    ["co_maker_name", "comaker_name", "coborrower_name", "co_borrower_name", "guarantor_name", "surety_name"],
    "co_maker_name"
  );
  const coMakerClientExpression = nullableLoanColumnExpression(
    loanColumns,
    ["co_maker_cis_no", "comaker_cis_no", "co_maker_cis", "comaker_cis", "co_maker_client_id", "comaker_client_id", "co_cis_no"],
    "co_maker_client_remote_id"
  );
  const coMakerContactExpression = nullableLoanColumnExpression(
    loanColumns,
    ["co_maker_contact", "comaker_contact", "co_maker_contact_number", "comaker_contact_number", "co_maker_cell", "comaker_cell", "co_maker_phone"],
    "co_maker_contact_number"
  );
  const coMakerValidIdExpression = nullableLoanColumnExpression(
    loanColumns,
    ["co_maker_valid_id", "comaker_valid_id", "co_maker_valid_id_number", "comaker_valid_id_number", "co_maker_id_number", "comaker_id_number"],
    "co_maker_valid_id_number"
  );
  const coMakerAddressExpression = nullableLoanColumnExpression(
    loanColumns,
    ["co_maker_address", "comaker_address", "co_maker_addr", "comaker_addr", "co_borrower_address"],
    "co_maker_address"
  );
  const loanProductCandidates = [
    "loan_product",
    "product",
    "product_name",
    "prod_name",
    "loan_type",
    "loan_type_name",
    "type_of_loan",
    "loan_category",
    "product_code",
    "prod_code",
    "loan_purpose"
  ];
  const loanProductColumn = firstExistingColumn(loanColumns, loanProductCandidates);
  const productColumns = tableColumns["dbo.tb_loan_product"] ?? tableColumns.tb_loan_product;
  const productCodeColumn = firstExistingColumn(productColumns, ["id_code", "product_code", "prod_code", "code"]);
  const productNameColumn = firstExistingColumn(productColumns, ["description", "product_name", "prod_name", "name"]);
  const canJoinProductLookup = Boolean(loanProductColumn && productCodeColumn && productNameColumn);
  const rawLoanProductExpression = loanProductColumn
    ? `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), loan.${bracketColumn(loanProductColumn)}))), '')`
    : "CAST(NULL AS NVARCHAR(255))";
  const loanProductExpression = canJoinProductLookup
    ? `COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), loan_product.${bracketColumn(productNameColumn!)}))), ''), ${rawLoanProductExpression}) AS loan_product`
    : `${rawLoanProductExpression} AS loan_product`;
  const loanProductJoin = canJoinProductLookup
    ? `LEFT JOIN dbo.tb_loan_product loan_product ON CONVERT(NVARCHAR(255), loan_product.${bracketColumn(productCodeColumn!)}) = CONVERT(NVARCHAR(255), loan.${bracketColumn(loanProductColumn!)})`
    : "";

  const queries: Record<BranchTable, string> = {
    tb_loan_cif: `
      SELECT
        NULLIF(LTRIM(RTRIM(cis_no)), '') AS id,
        cis_no AS client_id,
        NULLIF(LTRIM(RTRIM(ISNULL(lname, '') + ' ' + ISNULL(fname, '') + ' ' + ISNULL(mi, ''))), '') AS full_name,
        birthday AS birthdate,
        COALESCE(NULLIF(LTRIM(RTRIM(cell1)), ''), NULLIF(LTRIM(RTRIM(cell2)), ''), NULLIF(LTRIM(RTRIM(telephone)), '')) AS contact_number,
        custnum AS valid_id_number,
        NULLIF(LTRIM(RTRIM(
          ISNULL(add1, '') + ' ' +
          ISNULL(add2, '') + ' ' +
          ISNULL(add_city, '') + ' ' +
          ISNULL(add_province, '')
        )), '') AS address,
        NULL AS updated_at
      FROM dbo.tb_loan_cif
      WHERE NULLIF(LTRIM(RTRIM(cis_no)), '') IS NOT NULL
      ORDER BY NULLIF(LTRIM(RTRIM(cis_no)), '') ASC
    `,
    tb_loan_data: `
      SELECT
        loan.loan_no AS id,
        loan.cis_no AS client_remote_id,
        loan.loan_no AS loan_number,
        ${loanProductExpression},
        ${coMakerNameExpression},
        ${coMakerClientExpression},
        ${coMakerContactExpression},
        ${coMakerValidIdExpression},
        ${coMakerAddressExpression},
        COALESCE(NULLIF(loan.principal, 0), NULLIF(loan.[principal_1st], 0), loan.net_amt, 0) AS principal_amount,
        COALESCE(NULLIF(loan.int_rate, 0), loan.int_adj, 0) AS interest_rate,
        COALESCE(loan.interest, loan.adj_interest, 0) AS interest_amount,
        COALESCE(loan.penalty, 0) AS penalty_amount,
        NULLIF(LTRIM(RTRIM(loan.term)), '') AS terms,
        COALESCE(payments.paid_amount, 0) AS paid_amount,
        COALESCE(NULLIF(loan.principal, 0), NULLIF(loan.[principal_1st], 0), loan.net_amt, 0)
          + COALESCE(loan.interest, loan.adj_interest, 0)
          + COALESCE(loan.penalty, 0)
          - COALESCE(payments.paid_amount, 0) AS balance,
        COALESCE(NULLIF(loan.p_loan_status, 0), loan.loan_status) AS status,
        COALESCE(NULLIF(loan.p_loan_status, 0), loan.loan_status) AS source_status_code,
        loan_status.description AS source_status_name,
        loan.date_created AS released_at,
        loan.due_date AS maturity_at,
        COALESCE(loan.date_created, loan.due_date) AS updated_at
      FROM dbo.tb_loan_data loan
      LEFT JOIN dbo.tb_loan_status loan_status ON loan_status.id_code = COALESCE(NULLIF(loan.p_loan_status, 0), loan.loan_status)
      ${loanProductJoin}
      OUTER APPLY (
        SELECT SUM(COALESCE(paid_principal, 0) + COALESCE(paid_interest, 0)) AS paid_amount
        FROM dbo.tb_payment_history
        WHERE tb_payment_history.loan_no = loan.loan_no
      ) payments
      WHERE loan.loan_no IS NOT NULL
        AND loan.cis_no IS NOT NULL
      ORDER BY COALESCE(loan.date_created, loan.due_date) ASC, loan.loan_no ASC
    `,
    tb_payment_history: `
      SELECT
        payment.id_code AS id,
        loan.cis_no AS client_remote_id,
        payment.loan_no AS loan_remote_id,
        COALESCE(payment.paid_principal, 0) + COALESCE(payment.paid_interest, 0) AS amount,
        COALESCE(payment.tdate, payment.date_created) AS paid_at,
        COALESCE(payment.date_created, payment.tdate) AS updated_at
      FROM dbo.tb_payment_history payment
      INNER JOIN dbo.tb_loan_data loan ON loan.loan_no = payment.loan_no
      WHERE payment.id_code IS NOT NULL
        AND loan.cis_no IS NOT NULL
      ORDER BY COALESCE(payment.date_created, payment.tdate) ASC, payment.id_code ASC
    `,
    tb_amort_data: `
      SELECT
        amort.id_code AS id,
        amort.loan_no AS loan_remote_id,
        amort.amort_no,
        amort.amort_date,
        COALESCE(amort.principal_bal, 0) AS principal_balance,
        COALESCE(amort.interest_bal, 0) AS interest_balance,
        COALESCE(amort.principal_amort, 0) AS principal_amort,
        COALESCE(amort.interest_amort, 0) AS interest_amort,
        COALESCE(
          NULLIF(amort.total_amort, 0),
          COALESCE(amort.principal_amort, 0) + COALESCE(amort.interest_amort, 0) + COALESCE(amort.penalty, 0) + COALESCE(amort.pdi, 0) + COALESCE(amort.other_charges, 0),
          0
        ) AS total_amort,
        COALESCE(amort.paid_principal, 0) AS paid_principal,
        COALESCE(amort.paid_interest, 0) AS paid_interest,
        COALESCE(amort.paid_principal, 0) + COALESCE(amort.paid_interest, 0) AS paid_total,
        amort.paid_status
      FROM dbo.tb_amort_data amort
      INNER JOIN dbo.tb_loan_data loan ON loan.loan_no = amort.loan_no
      WHERE amort.id_code IS NOT NULL
        AND amort.loan_no IS NOT NULL
        AND loan.cis_no IS NOT NULL
      ORDER BY amort.loan_no ASC, amort.amort_no ASC
    `
  };

  const result = await request.query(queries[table]);
  return result.recordset as T[];
}

async function fetchBranchCoMakerRows(connection: ConnectionPool, sourceTable: BranchSourceTable, tableColumns: BranchTableColumns) {
  const columns = tableColumns[sourceTable.key] ?? tableColumns[sourceTable.tableName.toLowerCase()];
  const nameExpression = coMakerNameExpression("cm", columns);
  const loanColumn = firstExistingColumn(columns, ["loan_no", "loan_number", "loan_id", "loanid", "acct_no", "account_no", "loan_remote_id"]);
  if (!nameExpression || !loanColumn) return [];

  const idExpression = firstExistingColumn(columns, ["id_code", "id", "remote_id", "comaker_id", "co_maker_id", "cm_id"])
    ? `CONVERT(NVARCHAR(255), cm.${bracketColumn(firstExistingColumn(columns, ["id_code", "id", "remote_id", "comaker_id", "co_maker_id", "cm_id"]) as string)})`
    : `CONVERT(NVARCHAR(255), cm.${bracketColumn(loanColumn)}) + ':' + ${nameExpression}`;
  const clientExpression = nullableColumnExpression(
    "cm",
    columns,
    ["cis_no", "client_remote_id", "client_id", "co_maker_cis_no", "comaker_cis_no", "cust_no", "customer_no"],
    "client_remote_id"
  );
  const contactExpression = nullableColumnExpression(
    "cm",
    columns,
    ["contact_number", "contact_no", "cell1", "cell2", "cellphone", "phone", "telephone", "mobile_no"],
    "contact_number"
  );
  const validIdExpression = nullableColumnExpression(
    "cm",
    columns,
    ["valid_id_number", "valid_id", "id_number", "custnum", "gov_id", "government_id"],
    "valid_id_number"
  );
  const addressExpression = nullableColumnExpression(
    "cm",
    columns,
    ["address", "addr", "full_address", "home_address"],
    "address"
  );

  const result = await connection.request().query(`
    SELECT
      ${idExpression} AS id,
      cm.${bracketColumn(loanColumn)} AS loan_remote_id,
      ${nameExpression} AS name,
      ${clientExpression},
      ${contactExpression},
      ${validIdExpression},
      ${addressExpression}
    FROM ${bracketTableName(sourceTable.schemaName, sourceTable.tableName)} cm
    WHERE cm.${bracketColumn(loanColumn)} IS NOT NULL
      AND ${nameExpression} IS NOT NULL
    ORDER BY cm.${bracketColumn(loanColumn)} ASC, ${nameExpression} ASC
  `);

  return result.recordset as BranchCoMakerRow[];
}

async function fetchLoanDataCoMakerRows(connection: ConnectionPool, tableColumns: BranchTableColumns) {
  const loanColumns = tableColumns["dbo.tb_loan_data"] ?? tableColumns.tb_loan_data;
  const coMakerColumns = tableColumns["dbo.tb_comaker_data"] ?? tableColumns.tb_comaker_data;
  if (!loanColumns || !coMakerColumns) return [];

  const coMakerIdColumn = firstExistingColumn(coMakerColumns, ["comaker_id", "co_maker_id", "id_code", "id"]);
  const coMakerNameColumn = firstExistingColumn(coMakerColumns, ["name", "full_name", "comaker_name", "co_maker_name"]);
  const loanNumberColumn = firstExistingColumn(loanColumns, ["loan_no", "loan_number", "loan_id"]);
  if (!coMakerIdColumn || !coMakerNameColumn || !loanNumberColumn) return [];

  const slotColumns = ["comaker_1", "comaker_2", "comaker_3", "comaker1", "comaker2", "coborrower"]
    .filter((column) => loanColumns.has(normalizeColumnName(column)));
  if (!slotColumns.length) return [];

  const contactExpression = nullableColumnExpression("cm", coMakerColumns, ["contact_no", "contact_nos", "contact_number", "phone", "cellphone"], "contact_number");
  const addressExpression = nullableColumnExpression("cm", coMakerColumns, ["address", "addr", "full_address"], "address");

  const unions = slotColumns.map((slotColumn) => `
    SELECT
      CONVERT(NVARCHAR(255), loan.${bracketColumn(loanNumberColumn)}) + ':${slotColumn}:' + CONVERT(NVARCHAR(255), cm.${bracketColumn(coMakerIdColumn)}) AS id,
      loan.${bracketColumn(loanNumberColumn)} AS loan_remote_id,
      NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), cm.${bracketColumn(coMakerNameColumn)}))), '') AS name,
      CONVERT(NVARCHAR(255), cm.${bracketColumn(coMakerIdColumn)}) AS client_remote_id,
      ${contactExpression},
      CAST(NULL AS NVARCHAR(255)) AS valid_id_number,
      ${addressExpression}
    FROM dbo.tb_loan_data loan
    INNER JOIN dbo.tb_comaker_data cm
      ON CONVERT(NVARCHAR(255), cm.${bracketColumn(coMakerIdColumn)}) = CONVERT(NVARCHAR(255), loan.${bracketColumn(slotColumn)})
    WHERE loan.${bracketColumn(loanNumberColumn)} IS NOT NULL
      AND loan.${bracketColumn(slotColumn)} IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), loan.${bracketColumn(slotColumn)}))), '') IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), cm.${bracketColumn(coMakerNameColumn)}))), '') IS NOT NULL
  `);

  const result = await connection.request().query(unions.join("\nUNION ALL\n"));
  return result.recordset as BranchCoMakerRow[];
}

async function upsertBranchCoMaker(branchId: number, loanId: number, loanRemoteId: string | number, row: {
  id?: string | number | null;
  name?: string | null;
  client_remote_id?: string | number | null;
  contact_number?: string | null;
  valid_id_number?: string | null;
  address?: string | null;
}, sourcePrefix = "loan") {
  const coMakerName = row.name?.trim();
  if (!coMakerName) return false;

  const coMakerIdentity = String(row.id ?? row.client_remote_id ?? row.valid_id_number ?? coMakerName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const remoteId = `${sourcePrefix}:${loanRemoteId}:${coMakerIdentity}`;

  await prisma.coMaker.upsert({
    where: { branchId_remoteId: { branchId, remoteId } },
    create: {
      branchId,
      loanId,
      remoteId,
      name: coMakerName,
      clientRemoteId: row.client_remote_id === null || row.client_remote_id === undefined ? null : String(row.client_remote_id),
      contactNumber: row.contact_number ?? null,
      validIdNumber: row.valid_id_number ?? null,
      address: row.address ?? null
    },
    update: {
      loanId,
      name: coMakerName,
      clientRemoteId: row.client_remote_id === null || row.client_remote_id === undefined ? null : String(row.client_remote_id),
      contactNumber: row.contact_number ?? null,
      validIdNumber: row.valid_id_number ?? null,
      address: row.address ?? null
    }
  });

  return true;
}

async function upsertBranchCoMakers(branchId: number, rows: BranchCoMakerRow[], sourcePrefix: string) {
  if (!rows.length) return 0;

  let pulled = 0;
  const loanRemoteIds = Array.from(new Set(rows.map((row) => String(row.loan_remote_id))));
  const loanByRemoteId = new Map<string, { id: number; remoteId: string }>();
  const chunkSize = 1000;

  for (let index = 0; index < loanRemoteIds.length; index += chunkSize) {
    const chunk = loanRemoteIds.slice(index, index + chunkSize);
    const loans = await prisma.loan.findMany({
      where: {
        branchId,
        remoteId: { in: chunk }
      },
      select: {
        id: true,
        remoteId: true
      }
    });

    for (const loan of loans) {
      loanByRemoteId.set(loan.remoteId, loan);
    }
  }

  for (const row of rows) {
    const loan = loanByRemoteId.get(String(row.loan_remote_id));
    if (!loan) continue;

    const didPull = await upsertBranchCoMaker(branchId, loan.id, row.loan_remote_id, row, sourcePrefix);
    if (didPull) pulled += 1;
  }

  return pulled;
}

async function describeBranchDatabase(connection: ConnectionPool) {
  const result = await connection.request().query(`
    SELECT DB_NAME() AS database_name;

    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME IN ('tb_loan_cif', 'tb_loan_data', 'tb_payment_history')
       OR TABLE_NAME LIKE '%cif%'
       OR TABLE_NAME LIKE '%loan%'
       OR TABLE_NAME LIKE '%payment%'
       OR TABLE_NAME LIKE '%maker%'
       OR TABLE_NAME LIKE '%comaker%'
       OR TABLE_NAME LIKE '%borrower%'
       OR TABLE_NAME LIKE '%guarantor%'
       OR TABLE_NAME LIKE '%surety%'
    ORDER BY TABLE_SCHEMA, TABLE_NAME;
  `);

  const recordsets = result.recordsets as unknown as Array<Array<Record<string, string>>>;
  const databaseName = recordsets[0]?.[0]?.database_name ?? "unknown";
  const tables = (recordsets[1] ?? [])
    .map((row) => `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`)
    .slice(0, 12);

  return `Connected database: ${databaseName}. Visible matching tables: ${tables.join(", ") || "none"}.`;
}

export async function syncBranch(branch: Branch): Promise<BranchSyncResult> {
  const startedAt = new Date();
  const lastSuccess = await prisma.syncLog.findFirst({
    where: { branchId: branch.id, status: "SUCCESS" },
    orderBy: { startedAt: "desc" }
  });

  let clientsPulled = 0;
  let loansPulled = 0;
  let paymentsPulled = 0;
  let coMakersPulled = 0;
  let connection: ConnectionPool | null = null;
  let connectionHost: string | null = null;

  try {
    const connected = await getConnection(branch);
    connection = connected.pool;
    connectionHost = connected.host;
    const since = lastSuccess?.startedAt ?? null;
    const tableColumns = await getBranchTableColumns(connection);
    const sourceTables = await getBranchSourceTables(connection);
    const coMakerSourceTable = findCoMakerSourceTable(sourceTables, tableColumns);

    const clientRows = await fetchBranchRows<BranchClientRow>(connection, "tb_loan_cif", since, tableColumns);
    for (const row of clientRows) {
      await prisma.client.upsert({
        where: { branchId_remoteId: { branchId: branch.id, remoteId: String(row.id) } },
        create: {
          branchId: branch.id,
          remoteId: String(row.id),
          clientId: row.client_id ?? null,
          fullName: row.full_name || "Unnamed Client",
          birthdate: asDate(row.birthdate),
          contactNumber: row.contact_number ?? null,
          validIdNumber: row.valid_id_number ?? null,
          address: row.address ?? null,
          remoteUpdatedAt: asDate(row.updated_at)
        },
        update: {
          clientId: row.client_id ?? null,
          fullName: row.full_name || "Unnamed Client",
          birthdate: asDate(row.birthdate),
          contactNumber: row.contact_number ?? null,
          validIdNumber: row.valid_id_number ?? null,
          address: row.address ?? null,
          remoteUpdatedAt: asDate(row.updated_at)
        }
      });
      clientsPulled += 1;
    }

    const loanRows = await fetchBranchRows<BranchLoanRow>(connection, "tb_loan_data", since, tableColumns);
    for (const row of loanRows) {
      const client = await prisma.client.findUnique({
        where: { branchId_remoteId: { branchId: branch.id, remoteId: String(row.client_remote_id) } }
      });
      if (!client) continue;

      const principalAmount = asNumber(row.principal_amount);
      const interestRate = asNumber(row.interest_rate);
      const interestAmount = asNumber(row.interest_amount);
      const penaltyAmount = asNumber(row.penalty_amount);
      const paidAmount = asNumber(row.paid_amount);
      const sourceStatusCode = row.source_status_code === null || row.source_status_code === undefined ? null : Number(row.source_status_code);
      const normalizedStatusCode = Number.isFinite(sourceStatusCode) ? sourceStatusCode : null;
      const balance = normalizedStatusCode === 10 || normalizedStatusCode === 12 ? 0 : loanBalance(principalAmount, interestAmount, penaltyAmount, paidAmount);
      const sourceStatusName = row.source_status_name ?? null;

      const loan = await prisma.loan.upsert({
        where: { branchId_remoteId: { branchId: branch.id, remoteId: String(row.id) } },
        create: {
          branchId: branch.id,
          clientId: client.id,
          remoteId: String(row.id),
          loanNumber: row.loan_number ?? null,
          loanProduct: row.loan_product ?? null,
          principalAmount,
          interestRate,
          interestAmount,
          penaltyAmount,
          terms: row.terms ?? null,
          paidAmount,
          balance,
          status: statusToLoanStatus(row.status, balance),
          sourceStatusCode: normalizedStatusCode,
          sourceStatusName,
          releasedAt: asDate(row.released_at),
          maturityAt: asDate(row.maturity_at),
          remoteUpdatedAt: asDate(row.updated_at)
        },
        update: {
          clientId: client.id,
          loanNumber: row.loan_number ?? null,
          loanProduct: row.loan_product ?? null,
          principalAmount,
          interestRate,
          interestAmount,
          penaltyAmount,
          terms: row.terms ?? null,
          paidAmount,
          balance,
          status: statusToLoanStatus(row.status, balance),
          sourceStatusCode: normalizedStatusCode,
          sourceStatusName,
          releasedAt: asDate(row.released_at),
          maturityAt: asDate(row.maturity_at),
          remoteUpdatedAt: asDate(row.updated_at)
        }
      });

      const inlineCoMakerPulled = await upsertBranchCoMaker(branch.id, loan.id, row.id, {
        name: row.co_maker_name,
        client_remote_id: row.co_maker_client_remote_id,
        contact_number: row.co_maker_contact_number,
        valid_id_number: row.co_maker_valid_id_number,
        address: row.co_maker_address
      });
      if (inlineCoMakerPulled) coMakersPulled += 1;
      loansPulled += 1;
    }

    if (coMakerSourceTable) {
      const coMakerRows = await fetchBranchCoMakerRows(connection, coMakerSourceTable, tableColumns);
      coMakersPulled += await upsertBranchCoMakers(branch.id, coMakerRows, coMakerSourceTable.tableName);
    }

    const loanDataCoMakerRows = await fetchLoanDataCoMakerRows(connection, tableColumns);
    coMakersPulled += await upsertBranchCoMakers(branch.id, loanDataCoMakerRows, "tb_loan_data");

    const amortizationRows = await fetchBranchRows<BranchAmortizationRow>(connection, "tb_amort_data", since, tableColumns);
    for (const row of amortizationRows) {
      const loan = await prisma.loan.findUnique({
        where: { branchId_remoteId: { branchId: branch.id, remoteId: String(row.loan_remote_id) } }
      });
      if (!loan) continue;

      const paidStatus = row.paid_status === null || row.paid_status === undefined ? null : Number(row.paid_status);

      await prisma.amortizationSchedule.upsert({
        where: { branchId_remoteId: { branchId: branch.id, remoteId: String(row.id) } },
        create: {
          branchId: branch.id,
          clientId: loan.clientId,
          loanId: loan.id,
          remoteId: String(row.id),
          amortNo: Number(row.amort_no ?? 0),
          amortDate: asDate(row.amort_date),
          principalBalance: asNumber(row.principal_balance),
          interestBalance: asNumber(row.interest_balance),
          principalAmort: asNumber(row.principal_amort),
          interestAmort: asNumber(row.interest_amort),
          totalAmort: asNumber(row.total_amort),
          paidPrincipal: asNumber(row.paid_principal),
          paidInterest: asNumber(row.paid_interest),
          paidTotal: asNumber(row.paid_principal) + asNumber(row.paid_interest),
          paidStatus: Number.isFinite(paidStatus) ? paidStatus : null
        },
        update: {
          clientId: loan.clientId,
          loanId: loan.id,
          amortNo: Number(row.amort_no ?? 0),
          amortDate: asDate(row.amort_date),
          principalBalance: asNumber(row.principal_balance),
          interestBalance: asNumber(row.interest_balance),
          principalAmort: asNumber(row.principal_amort),
          interestAmort: asNumber(row.interest_amort),
          totalAmort: asNumber(row.total_amort),
          paidPrincipal: asNumber(row.paid_principal),
          paidInterest: asNumber(row.paid_interest),
          paidTotal: asNumber(row.paid_principal) + asNumber(row.paid_interest),
          paidStatus: Number.isFinite(paidStatus) ? paidStatus : null
        }
      });
    }

    await reconcileLoanBalancesFromAmortization(branch.id);

    const paymentRows = await fetchBranchRows<BranchPaymentRow>(connection, "tb_payment_history", since, tableColumns);
    for (const row of paymentRows) {
      const client = await prisma.client.findUnique({
        where: { branchId_remoteId: { branchId: branch.id, remoteId: String(row.client_remote_id) } }
      });
      if (!client) continue;

      const loan = row.loan_remote_id
        ? await prisma.loan.findUnique({
            where: { branchId_remoteId: { branchId: branch.id, remoteId: String(row.loan_remote_id) } }
          })
        : null;

      await prisma.payment.upsert({
        where: { branchId_remoteId: { branchId: branch.id, remoteId: String(row.id) } },
        create: {
          branchId: branch.id,
          clientId: client.id,
          loanId: loan?.id,
          remoteId: String(row.id),
          amount: row.amount ?? 0,
          paidAt: asDate(row.paid_at),
          remoteUpdatedAt: asDate(row.updated_at)
        },
        update: {
          clientId: client.id,
          loanId: loan?.id,
          amount: row.amount ?? 0,
          paidAt: asDate(row.paid_at),
          remoteUpdatedAt: asDate(row.updated_at)
        }
      });
      paymentsPulled += 1;
    }

    await prisma.branch.update({
      where: { id: branch.id },
      data: { lastSyncAt: new Date() }
    });

    await prisma.syncLog.create({
      data: {
        branchId: branch.id,
        status: "SUCCESS",
        startedAt,
        finishedAt: new Date(),
        clientsPulled,
        loansPulled,
        paymentsPulled,
        message: `${connectionHost ? `Branch sync completed via ${connectionHost}.` : "Branch sync completed."}${coMakerSourceTable ? ` Co-maker table: ${coMakerSourceTable.schemaName}.${coMakerSourceTable.tableName}.` : ""} Co-makers synced: ${coMakersPulled.toLocaleString("en-US")}.`
      }
    });

    return { branch: branch.branchCode, status: "SUCCESS", clientsPulled, loansPulled, paymentsPulled, coMakersPulled };
  } catch (error) {
    let message = error instanceof Error ? error.message : "Unknown sync failure.";

    if (connection && /Invalid object name/i.test(message)) {
      try {
        message = `${message} ${await describeBranchDatabase(connection)}`;
      } catch {
        // Keep the original sync error if the diagnostic query also fails.
      }
    }

    await prisma.syncLog.create({
      data: {
        branchId: branch.id,
        status: "FAILED",
        startedAt,
        finishedAt: new Date(),
        clientsPulled,
        loansPulled,
        paymentsPulled,
        message
      }
    });
    return { branch: branch.branchCode, status: "FAILED", message };
  } finally {
    await connection?.close();
  }
}

export async function syncBranchCoMakersOnly(branch: Branch): Promise<BranchSyncResult> {
  const startedAt = new Date();
  let coMakersPulled = 0;
  let connection: ConnectionPool | null = null;
  let connectionHost: string | null = null;

  try {
    const connected = await getConnection(branch);
    connection = connected.pool;
    connectionHost = connected.host;
    const tableColumns = await getBranchTableColumns(connection);
    const sourceTables = await getBranchSourceTables(connection);
    const coMakerSourceTable = findCoMakerSourceTable(sourceTables, tableColumns);

    if (coMakerSourceTable) {
      const coMakerRows = await fetchBranchCoMakerRows(connection, coMakerSourceTable, tableColumns);
      coMakersPulled += await upsertBranchCoMakers(branch.id, coMakerRows, coMakerSourceTable.tableName);
    }

    const loanDataCoMakerRows = await fetchLoanDataCoMakerRows(connection, tableColumns);
    coMakersPulled += await upsertBranchCoMakers(branch.id, loanDataCoMakerRows, "tb_loan_data");

    await prisma.syncLog.create({
      data: {
        branchId: branch.id,
        status: "SUCCESS",
        startedAt,
        finishedAt: new Date(),
        clientsPulled: 0,
        loansPulled: 0,
        paymentsPulled: 0,
        message: `${connectionHost ? `Co-maker-only sync completed via ${connectionHost}.` : "Co-maker-only sync completed."}${coMakerSourceTable ? ` Co-maker table: ${coMakerSourceTable.schemaName}.${coMakerSourceTable.tableName}.` : ""} Co-makers synced: ${coMakersPulled.toLocaleString("en-US")}.`
      }
    });

    return { branch: branch.branchCode, status: "SUCCESS", clientsPulled: 0, loansPulled: 0, paymentsPulled: 0, coMakersPulled };
  } catch (error) {
    let message = error instanceof Error ? error.message : "Unknown co-maker sync failure.";

    if (connection && /Invalid object name/i.test(message)) {
      try {
        message = `${message} ${await describeBranchDatabase(connection)}`;
      } catch {
        // Keep the original sync error if the diagnostic query also fails.
      }
    }

    await prisma.syncLog.create({
      data: {
        branchId: branch.id,
        status: "FAILED",
        startedAt,
        finishedAt: new Date(),
        message
      }
    });

    return { branch: branch.branchCode, status: "FAILED", message };
  } finally {
    await connection?.close();
  }
}

async function createSyncSummaryLog({
  startedAt,
  results,
  skipped,
  messagePrefix,
  summaryLogId
}: {
  startedAt: Date;
  results: BranchSyncResult[];
  skipped?: number;
  messagePrefix?: string;
  summaryLogId?: number;
}) {
  const completed = results.filter((result) => result.status === "SUCCESS").length;
  const failed = results.filter((result) => result.status === "FAILED").length;
  const clientsPulled = results.reduce((total, result) => total + ("clientsPulled" in result ? result.clientsPulled ?? 0 : 0), 0);
  const loansPulled = results.reduce((total, result) => total + ("loansPulled" in result ? result.loansPulled ?? 0 : 0), 0);
  const paymentsPulled = results.reduce((total, result) => total + ("paymentsPulled" in result ? result.paymentsPulled ?? 0 : 0), 0);
  const coMakersPulled = results.reduce((total, result) => total + ("coMakersPulled" in result ? result.coMakersPulled ?? 0 : 0), 0);
  const status: "SUCCESS" | "PARTIAL" | "FAILED" = failed ? (completed ? "PARTIAL" : "FAILED") : "SUCCESS";
  const skippedText = skipped ? ` Skipped ${skipped.toLocaleString("en-US")} offline branch${skipped === 1 ? "" : "es"}.` : "";
  const message = `${messagePrefix ? `${messagePrefix}: ` : ""}${completed} completed, ${failed} failed. Synced ${clientsPulled.toLocaleString("en-US")} clients, ${loansPulled.toLocaleString("en-US")} loans, ${paymentsPulled.toLocaleString("en-US")} payments, ${coMakersPulled.toLocaleString("en-US")} co-makers.${skippedText}`;

  const data = {
    status,
    startedAt,
    finishedAt: new Date(),
    clientsPulled,
    loansPulled,
    paymentsPulled,
    branchesCompleted: completed,
    branchesFailed: failed,
    message
  };

  if (summaryLogId) {
    await prisma.syncLog.update({
      where: { id: summaryLogId },
      data
    });
  } else {
    await prisma.syncLog.create({ data });
  }

  return { completed, failed, clientsPulled, loansPulled, paymentsPulled, coMakersPulled, message };
}

function sortByOldestSync(branches: Branch[]) {
  return [...branches].sort((a, b) => {
    const aTime = a.lastSyncAt?.getTime() ?? 0;
    const bTime = b.lastSyncAt?.getTime() ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.branchName.localeCompare(b.branchName);
  });
}

async function syncBranchesInBatches(branches: Branch[], concurrency = 2) {
  const results: BranchSyncResult[] = [];

  for (let index = 0; index < branches.length; index += concurrency) {
    const batch = branches.slice(index, index + concurrency);
    results.push(...(await Promise.all(batch.map((branch) => syncBranch(branch)))));
  }

  return results;
}

export async function syncAllBranches() {
  const startedAt = new Date();
  const branches = await prisma.branch.findMany({ where: { status: "ACTIVE" } });
  const results: BranchSyncResult[] = [];

  for (const branch of branches) {
    results.push(await syncBranch(branch));
  }

  const summary = await createSyncSummaryLog({ startedAt, results });

  return {
    startedAt: startedAt.toISOString(),
    totalBranches: branches.length,
    ...summary,
    results
  };
}

export async function syncOnlineBranches(messagePrefix = "Midnight sync") {
  const startedAt = new Date();
  const summaryLog = await prisma.syncLog.create({
    data: {
      status: "PARTIAL",
      startedAt,
      message: `${messagePrefix}: running daily sync for all active branches. Co-makers will be synced with each branch.`
    }
  });
  const branches = sortByOldestSync(await prisma.branch.findMany({ where: { status: "ACTIVE" } }));
  const results = await syncBranchesInBatches(branches);
  const summary = await createSyncSummaryLog({ startedAt, results, messagePrefix, summaryLogId: summaryLog.id });

  return {
    startedAt: startedAt.toISOString(),
    totalBranches: branches.length,
    skipped: 0,
    ...summary,
    results
  };
}
