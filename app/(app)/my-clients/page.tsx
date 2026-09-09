import type { Prisma } from "@prisma/client";
import { MapPinned, UserRound, Users } from "lucide-react";
import { BarangayLoanReport } from "@/components/officer-barangay-loans";
import { ReorderableRows } from "@/components/reorderable-rows";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { getAccessibleBranchIds, requireFunction } from "@/lib/auth";
import { employeeLoanFilterFor } from "@/lib/employee-loans";
import { money as pesos } from "@/lib/format";
import { effectiveLocationCategory, manilaDateKey, type LocationClientCategory } from "@/lib/location-loan-aging";
import { scheduleFactsByLoan, type LoanScheduleFacts } from "@/lib/principal-balance";
import { prisma } from "@/lib/prisma";
import { officerChoiceFor, resolveOfficerIds } from "@/lib/officer-scope";
import { OfficerPicker } from "./officer-picker";

export const dynamic = "force-dynamic";

// One officer's own book, grouped the way the Location Masterlist groups the whole portfolio.
// The clients are the officer's; the grouping is the location's.

type Totals = {
  clients: Set<number>;
  portfolio: number;
  categoryByClient: Map<number, LocationClientCategory>;
  principalByClient: Map<number, number>;
};

type Reported = {
  clients: number;
  portfolio: number;
  current: number;
  currentBalance: number;
  delayed: number;
  delayedBalance: number;
  pastDue: number;
  pastDueBalance: number;
  litigated: number;
  litigatedBalance: number;
};

const rowGrid = "grid grid-cols-[minmax(150px,2fr)_repeat(5,minmax(0,1fr))] items-start gap-x-2";
const caret = "before:mr-2 before:inline-block before:content-['>']";

function emptyTotals(): Totals {
  return { clients: new Set(), portfolio: 0, categoryByClient: new Map(), principalByClient: new Map() };
}

const severity: Record<LocationClientCategory, number> = { current: 0, delayed: 1, pastDue: 2, litigated: 3 };

function worseOf(current: LocationClientCategory | undefined, next: LocationClientCategory) {
  if (!current) return next;
  return severity[next] > severity[current] ? next : current;
}

// A client counts once wherever they appear, and carries their worst category across the loans
// they hold in that place - the same rule the Location Masterlist uses, so the two agree.
function reported(totals: Totals | undefined): Reported {
  const empty = {
    clients: 0, portfolio: 0, current: 0, currentBalance: 0, delayed: 0,
    delayedBalance: 0, pastDue: 0, pastDueBalance: 0, litigated: 0, litigatedBalance: 0
  };
  if (!totals) return empty;
  const status = {
    current: { clients: 0, balance: 0 },
    delayed: { clients: 0, balance: 0 },
    pastDue: { clients: 0, balance: 0 },
    litigated: { clients: 0, balance: 0 }
  };
  for (const [clientId, category] of totals.categoryByClient) {
    status[category].clients += 1;
    status[category].balance += totals.principalByClient.get(clientId) ?? 0;
  }
  return {
    clients: totals.clients.size,
    portfolio: totals.portfolio,
    current: status.current.clients,
    currentBalance: status.current.balance,
    delayed: status.delayed.clients,
    delayedBalance: status.delayed.balance,
    pastDue: status.pastDue.clients,
    pastDueBalance: status.pastDue.balance,
    litigated: status.litigated.clients,
    litigatedBalance: status.litigated.balance
  };
}

function add(target: Map<string, Totals>, key: string, clientId: number, principal: number, category: LocationClientCategory) {
  const totals = target.get(key) ?? emptyTotals();
  totals.clients.add(clientId);
  totals.portfolio += principal;
  totals.principalByClient.set(clientId, (totals.principalByClient.get(clientId) ?? 0) + principal);
  totals.categoryByClient.set(clientId, worseOf(totals.categoryByClient.get(clientId), category));
  target.set(key, totals);
}

// Same rule the pivot uses: with no schedule, or nothing owed on principal, fall back to the
// loan's own principal, and never report more than the balance.
function principalOf(loan: { principalAmount: unknown; balance: unknown }, facts: LoanScheduleFacts | undefined) {
  const balance = Math.max(0, Number(loan.balance));
  const fallback = Math.min(Math.max(0, Number(loan.principalAmount)), balance);
  if (!facts) return fallback;
  return facts.principalBalance > 0 ? Math.min(facts.principalBalance, balance) : fallback;
}

function officerDetail(officer: {
  privilegeTemplate: { name: string } | null;
  area: { name: string } | null;
  baseBranch: { branchName: string; branchCode: string } | null;
}) {
  const privilege = (officer.privilegeTemplate?.name ?? "").trim();
  const key = privilege.toLocaleLowerCase("en");
  const branch = officer.baseBranch ? `${officer.baseBranch.branchCode} - ${officer.baseBranch.branchName}` : null;
  if (key.startsWith("area") || key === "remedial officer") {
    return [officer.area?.name, privilege].filter(Boolean).join(" · ") || null;
  }
  return [branch, privilege].filter(Boolean).join(" · ") || null;
}

const officerSelect = {
  id: true,
  name: true,
  privilegeTemplate: { select: { name: true } },
  area: { select: { name: true } },
  baseBranch: { select: { branchName: true, branchCode: true } }
} as const;

export default async function MyClientsPage({
  searchParams
}: {
  searchParams?: Promise<{ officerId?: string; scope?: string }>;
}) {
  const user = await requireFunction("MY_CLIENTS");
  const params = await searchParams;
  const isOfficer = user.role === "ACCOUNT_OFFICER";

  // Who this reader may look at, and how they choose. An officer has themselves and no choice;
  // a team leader has the area or branch they lead; an administrator has everything.
  const choice = await officerChoiceFor(user);
  // "all" totals every officer in the chosen area or branch; a number is one officer. Either
  // way the answer is filtered by what this reader may see, so a guessed id returns nothing.
  const resolved = await resolveOfficerIds(user, { officerId: params?.officerId, scope: params?.scope });
  const officerIds = resolved.officerIds;

  const selectedOfficer = !resolved.isAll && officerIds.length === 1
    ? await prisma.user.findFirst({ where: { id: officerIds[0], role: "ACCOUNT_OFFICER" }, select: officerSelect })
    : null;

  const accessibleBranchIds = isOfficer ? null : await getAccessibleBranchIds(user);
  const branchWhere: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };

  const loans = officerIds.length
    ? await prisma.loan.findMany({
        where: {
          AND: [
            branchWhere,
            await employeeLoanFilterFor(user),
            accountTaggingSearchWhere({}),
            { locationLinked: true, locationMasterlistId: { not: null } },
            { remedialAssignment: { is: { status: "ACTIVE", assignedToId: { in: officerIds } } } }
          ]
        },
        select: {
          id: true,
          clientId: true,
          balance: true,
          principalAmount: true,
          maturityAt: true,
          sourceStatusName: true,
          locationMasterlist: { select: { id: true, province: true, municipality: true, barangay: true } }
        }
      })
    : [];

  const todayKey = manilaDateKey(new Date());
  const facts = await scheduleFactsByLoan(loans.map((loan) => loan.id), todayKey);

  const byProvince = new Map<string, Totals>();
  const byMunicipality = new Map<string, Totals>();
  const byBarangay = new Map<string, Totals>();
  const overall = new Map<string, Totals>();
  const tree = new Map<string, Map<string, Map<string, { id: number; name: string }>>>();

  for (const loan of loans) {
    const place = loan.locationMasterlist;
    if (!place) continue;
    const principal = principalOf(loan, facts.get(loan.id));
    const category = effectiveLocationCategory(loan, todayKey, facts.get(loan.id)?.hasUnpaidDue ?? false);
    const municipalityKey = `${place.province}\u0000${place.municipality}`;
    add(overall, "all", loan.clientId, principal, category);
    add(byProvince, place.province, loan.clientId, principal, category);
    add(byMunicipality, municipalityKey, loan.clientId, principal, category);
    add(byBarangay, `${municipalityKey}\u0000${place.barangay}`, loan.clientId, principal, category);
    const municipalities = tree.get(place.province) ?? new Map<string, Map<string, { id: number; name: string }>>();
    const barangays = municipalities.get(place.municipality) ?? new Map<string, { id: number; name: string }>();
    barangays.set(place.barangay, { id: place.id, name: place.barangay });
    municipalities.set(place.municipality, barangays);
    tree.set(place.province, municipalities);
  }

  const totals = reported(overall.get("all"));
  const provinces = Array.from(tree.keys()).sort(
    (a, b) => reported(byProvince.get(b)).portfolio - reported(byProvince.get(a)).portfolio
  );
  const officerLabel = selectedOfficer ? officerDetail(selectedOfficer) : null;
  const scopeKey = selectedOfficer ? String(selectedOfficer.id) : `all-${params?.scope ?? "none"}`;
  const reportOfficer: { officerId?: number; officerName?: string; officerIds?: number[] } = selectedOfficer
    ? { officerId: selectedOfficer.id, officerName: selectedOfficer.name }
    : { officerIds };
  const heading = resolved.isAll
    ? `${resolved.scopeLabel ?? "All"} — all officers`
    : isOfficer || !selectedOfficer ? "My Clients" : selectedOfficer.name.toLocaleUpperCase("en");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">My Clients</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          {heading}
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
          <MapPinned className="h-4 w-4 text-brand-blue" />
          Outstanding clients grouped by province, city/municipality, and barangay.
          {officerLabel ? <span className="text-brand-blue">{officerLabel}</span> : null}
        </p>
      </div>

      {choice.mode === "choose"
        ? <OfficerPicker scopes={choice.scopes} officers={choice.officers} selectedId={selectedOfficer?.id ?? null} selectedAll={resolved.isAll} allowAll basePath="/my-clients" subject="clients" />
        : null}

      {!officerIds.length ? (
        <div className="panel p-10 text-center">
          <UserRound className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">No officer selected.</p>
          <p className="mt-1 text-sm text-slate-500">Choose an officer above to see their clients.</p>
        </div>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            <Metric icon={Users} label="Clients" value={totals.clients.toLocaleString("en-US")} />
            <Metric
              icon={MapPinned}
              label="Locations"
              value={`${provinces.length.toLocaleString("en-US")} province(s)`}
              detail={`${byBarangay.size.toLocaleString("en-US")} barangay(s)`}
            />
            <Metric icon={Users} label="Principal balance" value={pesos(totals.portfolio)} tone="red" />
          </section>

          <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Metric icon={Users} label="Current" value={totals.current.toLocaleString("en-US")} detail={pesos(totals.currentBalance)} />
            <Metric icon={Users} label="Delayed" value={totals.delayed.toLocaleString("en-US")} detail={pesos(totals.delayedBalance)} tone="red" />
            <Metric icon={Users} label="Past Due" value={totals.pastDue.toLocaleString("en-US")} detail={pesos(totals.pastDueBalance)} tone="red" />
            <Metric icon={Users} label="Litigated" value={totals.litigated.toLocaleString("en-US")} detail={pesos(totals.litigatedBalance)} tone="red" />
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <h3 className="text-lg font-bold text-slate-950">Client Pivot</h3>
              <p className="mt-1 text-sm text-slate-600">
                {totals.clients.toLocaleString("en-US")} client(s) across {byBarangay.size.toLocaleString("en-US")} barangay(s).
              </p>
              <p className="mt-1 text-xs text-slate-500">
                As of {todayKey}: Past Due means maturity is before today with a remaining balance. Delayed means an
                amortization due on or before today is not fully paid. Litigated is tracked separately.
              </p>
            </div>
            <div className="text-sm">
              <div className={`${rowGrid} sticky top-0 z-10 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 shadow-sm`}>
                <span>Location</span>
                <span className="text-right">Clients</span>
                <Head label="Current" />
                <Head label="Delayed" />
                <Head label="Past Due" />
                <Head label="Litigated" />
              </div>
              {!provinces.length ? (
                <p className="px-4 py-10 text-center font-semibold text-slate-500">
                  No linked outstanding clients for this officer.
                </p>
              ) : (
                <ReorderableRows
                  ids={provinces}
                  storageKey={`my-clients-province-order:${scopeKey}`}
                  defaultOrderLabel="portfolio order"
                >
                  {provinces.map((province) => {
                    const municipalities = Array.from(tree.get(province)?.keys() ?? []).sort(
                      (a, b) =>
                        reported(byMunicipality.get(`${province}\u0000${b}`)).portfolio -
                        reported(byMunicipality.get(`${province}\u0000${a}`)).portfolio
                    );
                    return (
                      <details key={province} className="group">
                        <summary className={`${rowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open:bg-blue-100`}>
                          <span className={`font-bold text-slate-950 ${caret} group-open:before:rotate-90`}>
                            <span className="loc-caps">{province}</span>
                          </span>
                          <Cells
                            data={reported(byProvince.get(province))}
                            scope={{
                              ...reportOfficer,
                              province,
                              locationName: `My Clients — ${province}`
                            }}
                          />
                        </summary>
                        <div className="border-t border-slate-100 bg-slate-50/40 pl-6">
                          <ReorderableRows
                            ids={municipalities}
                            storageKey={`my-clients-city-order:${scopeKey}:${province}`}
                            defaultOrderLabel="portfolio order"
                            variant="compact"
                          >
                            {municipalities.map((municipality) => {
                              const barangays = Array.from(tree.get(province)?.get(municipality)?.values() ?? []).sort(
                                (a, b) =>
                                  reported(byBarangay.get(`${province}\u0000${municipality}\u0000${b.name}`)).portfolio -
                                  reported(byBarangay.get(`${province}\u0000${municipality}\u0000${a.name}`)).portfolio
                              );
                              return (
                                <details key={municipality} className="group/city border-b border-slate-100 last:border-b-0">
                                  <summary className={`${rowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open/city:bg-blue-100`}>
                                    <span className={`font-semibold text-slate-800 ${caret} group-open/city:before:rotate-90`}>
                                      <span className="loc-caps">{municipality}</span>
                                    </span>
                                    <Cells
                                      data={reported(byMunicipality.get(`${province}\u0000${municipality}`))}
                                      scope={{
                                        ...reportOfficer,
                                        province,
                                        municipality,
                                        locationName: `My Clients — ${municipality}, ${province}`
                                      }}
                                    />
                                  </summary>
                                  <div className="border-t border-slate-100 bg-white pl-6">
                                    {barangays.map((barangay) => (
                                      <div key={barangay.id} className={`${rowGrid} border-b border-slate-100 px-4 py-2.5 last:border-b-0`}>
                                        <span className="text-slate-700">
                                          <span className="loc-caps">{barangay.name}</span>
                                        </span>
                                        <Cells
                                          data={reported(byBarangay.get(`${province}\u0000${municipality}\u0000${barangay.name}`))}
                                          scope={{
                                            ...reportOfficer,
                                            locationId: barangay.id,
                                            locationName: `My Clients — ${barangay.name}, ${municipality}`
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              );
                            })}
                          </ReorderableRows>
                        </div>
                      </details>
                    );
                  })}
                </ReorderableRows>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

type CellScope = {
  // One officer, or every officer in an area or branch when the reader asked for all of them.
  officerId?: number;
  officerName?: string;
  officerIds?: number[];
  locationName: string;
  province?: string;
  municipality?: string;
  locationId?: number;
};

function Head({ label }: { label: string }) {
  return (
    <span className="text-right">
      {label}
      <span className="block text-[9px] normal-case tracking-normal">Clients / Principal</span>
    </span>
  );
}

function Cells({ data, scope }: { data: Reported; scope: CellScope }) {
  return (
    <>
      <span className="text-right font-bold text-brand-blue">
        <BarangayLoanReport {...scope} clientCount={data.clients} />
      </span>
      <Cell count={data.current} balance={data.currentBalance} category="current" scope={scope} />
      <Cell count={data.delayed} balance={data.delayedBalance} category="delayed" scope={scope} />
      <Cell count={data.pastDue} balance={data.pastDueBalance} category="pastDue" scope={scope} />
      <Cell count={data.litigated} balance={data.litigatedBalance} category="litigated" scope={scope} />
    </>
  );
}

function Cell({
  count,
  balance,
  category,
  scope
}: {
  count: number;
  balance: number;
  category: "current" | "delayed" | "pastDue" | "litigated";
  scope: CellScope;
}) {
  return (
    <span className="text-right">
      <span className="block font-bold text-slate-900">
        {count ? <BarangayLoanReport {...scope} category={category} clientCount={count} /> : "-"}
      </span>
      <span className="mt-0.5 block text-[10px] font-bold text-red-700">{balance ? pesos(balance) : "-"}</span>
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "blue"
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail?: string;
  tone?: "blue" | "red";
}) {
  const toneClass = tone === "red" ? "text-red-700" : "text-brand-blue";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className={`mb-3 inline-flex rounded-md bg-slate-50 p-2 ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}
