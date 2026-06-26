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

type BranchTable = "tb_loan_cif" | "tb_loan_data" | "tb_payment_history" | "tb_amort_data";
type BranchSyncResult =
  | { branch: string; status: "SUCCESS"; clientsPulled: number; loansPulled: number; paymentsPulled: number }
  | { branch: string; status: "FAILED"; message?: string }
  | { branch: string; status: "SKIPPED"; message: string };

function asDate(value?: Date | string | null) {
  if (!value) return null;
  return new Date(value);
}

function statusToLoanStatus(value?: string | number | null, balance?: string | number | null): LoanStatus {
  if (balance !== null && balance !== undefined && Number(balance) <= 0) {
    return "PAID";
  }

  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "10" || normalized === "CLOSED" || normalized === "PAID") {
    return "CLOSED";
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

async function getConnection(branch: Branch, options?: { connectionTimeout?: number; requestTimeout?: number }) {
  const { server, port } = parseSqlServerHost(branch.dbHost);

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

export async function checkBranchConnection(branch: Branch) {
  let connection: ConnectionPool | null = null;

  try {
    connection = await getConnection(branch, { connectionTimeout: 3000, requestTimeout: 5000 });
    await connection.request().query("SELECT 1 AS ok");

    return {
      status: "ONLINE" as const,
      checkedAt: new Date().toISOString(),
      message: "Connection successful."
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

async function fetchBranchRows<T>(connection: ConnectionPool, table: BranchTable, since: Date | null) {
  const request = connection.request();
  request.input("since", sql.DateTime2, since);

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
        loan.p_loan_status AS status,
        loan.p_loan_status AS source_status_code,
        loan_status.description AS source_status_name,
        loan.date_created AS released_at,
        loan.due_date AS maturity_at,
        COALESCE(loan.date_created, loan.due_date) AS updated_at
      FROM dbo.tb_loan_data loan
      LEFT JOIN dbo.tb_loan_status loan_status ON loan_status.id_code = loan.p_loan_status
      OUTER APPLY (
        SELECT SUM(COALESCE(paid_total, paid_principal, 0)) AS paid_amount
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
        COALESCE(payment.paid_total, payment.paid_principal, 0) AS amount,
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
        COALESCE(amort.paid_total, 0) AS paid_total,
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

async function describeBranchDatabase(connection: ConnectionPool) {
  const result = await connection.request().query(`
    SELECT DB_NAME() AS database_name;

    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME IN ('tb_loan_cif', 'tb_loan_data', 'tb_payment_history')
       OR TABLE_NAME LIKE '%cif%'
       OR TABLE_NAME LIKE '%loan%'
       OR TABLE_NAME LIKE '%payment%'
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
  let connection: ConnectionPool | null = null;

  try {
    connection = await getConnection(branch);
    const since = lastSuccess?.startedAt ?? null;

    const clientRows = await fetchBranchRows<BranchClientRow>(connection, "tb_loan_cif", since);
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

    const loanRows = await fetchBranchRows<BranchLoanRow>(connection, "tb_loan_data", since);
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
      const balance = principalAmount + interestAmount + penaltyAmount - paidAmount;
      const sourceStatusCode = row.source_status_code === null || row.source_status_code === undefined ? null : Number(row.source_status_code);
      const sourceStatusName = row.source_status_name ?? null;

      await prisma.loan.upsert({
        where: { branchId_remoteId: { branchId: branch.id, remoteId: String(row.id) } },
        create: {
          branchId: branch.id,
          clientId: client.id,
          remoteId: String(row.id),
          loanNumber: row.loan_number ?? null,
          principalAmount,
          interestRate,
          interestAmount,
          penaltyAmount,
          terms: row.terms ?? null,
          paidAmount,
          balance,
          status: statusToLoanStatus(row.status, balance),
          sourceStatusCode: Number.isFinite(sourceStatusCode) ? sourceStatusCode : null,
          sourceStatusName,
          releasedAt: asDate(row.released_at),
          maturityAt: asDate(row.maturity_at),
          remoteUpdatedAt: asDate(row.updated_at)
        },
        update: {
          clientId: client.id,
          loanNumber: row.loan_number ?? null,
          principalAmount,
          interestRate,
          interestAmount,
          penaltyAmount,
          terms: row.terms ?? null,
          paidAmount,
          balance,
          status: statusToLoanStatus(row.status, balance),
          sourceStatusCode: Number.isFinite(sourceStatusCode) ? sourceStatusCode : null,
          sourceStatusName,
          releasedAt: asDate(row.released_at),
          maturityAt: asDate(row.maturity_at),
          remoteUpdatedAt: asDate(row.updated_at)
        }
      });
      loansPulled += 1;
    }

    const amortizationRows = await fetchBranchRows<BranchAmortizationRow>(connection, "tb_amort_data", since);
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
          paidTotal: asNumber(row.paid_total),
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
          paidTotal: asNumber(row.paid_total),
          paidStatus: Number.isFinite(paidStatus) ? paidStatus : null
        }
      });
    }

    const paymentRows = await fetchBranchRows<BranchPaymentRow>(connection, "tb_payment_history", since);
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
        message: "Branch sync completed."
      }
    });

    return { branch: branch.branchCode, status: "SUCCESS", clientsPulled, loansPulled, paymentsPulled };
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

async function createSyncSummaryLog({
  startedAt,
  results,
  skipped,
  messagePrefix
}: {
  startedAt: Date;
  results: BranchSyncResult[];
  skipped?: number;
  messagePrefix?: string;
}) {
  const completed = results.filter((result) => result.status === "SUCCESS").length;
  const failed = results.filter((result) => result.status === "FAILED").length;
  const clientsPulled = results.reduce((total, result) => total + ("clientsPulled" in result ? result.clientsPulled ?? 0 : 0), 0);
  const loansPulled = results.reduce((total, result) => total + ("loansPulled" in result ? result.loansPulled ?? 0 : 0), 0);
  const paymentsPulled = results.reduce((total, result) => total + ("paymentsPulled" in result ? result.paymentsPulled ?? 0 : 0), 0);
  const status = failed ? (completed ? "PARTIAL" : "FAILED") : "SUCCESS";
  const skippedText = skipped ? ` Skipped ${skipped.toLocaleString("en-US")} offline branch${skipped === 1 ? "" : "es"}.` : "";
  const message = `${messagePrefix ? `${messagePrefix}: ` : ""}${completed} completed, ${failed} failed. Synced ${clientsPulled.toLocaleString("en-US")} clients, ${loansPulled.toLocaleString("en-US")} loans, ${paymentsPulled.toLocaleString("en-US")} payments.${skippedText}`;

  await prisma.syncLog.create({
    data: {
      status,
      startedAt,
      finishedAt: new Date(),
      clientsPulled,
      loansPulled,
      paymentsPulled,
      branchesCompleted: completed,
      branchesFailed: failed,
      message
    }
  });

  return { completed, failed, clientsPulled, loansPulled, paymentsPulled, message };
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
  const branches = await prisma.branch.findMany({ where: { status: "ACTIVE" } });
  const results: BranchSyncResult[] = [];

  for (const branch of branches) {
    const connection = await checkBranchConnection(branch);
    if (connection.status !== "ONLINE") {
      results.push({ branch: branch.branchCode, status: "SKIPPED", message: connection.message });
      continue;
    }

    results.push(await syncBranch(branch));
  }

  const skipped = results.filter((result) => result.status === "SKIPPED").length;
  const syncResults = results.filter((result) => result.status !== "SKIPPED");
  const summary = await createSyncSummaryLog({ startedAt, results: syncResults, skipped, messagePrefix });

  return {
    startedAt: startedAt.toISOString(),
    totalBranches: branches.length,
    skipped,
    ...summary,
    results
  };
}
