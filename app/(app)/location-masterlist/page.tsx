import type { Prisma } from "@prisma/client";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Metrics = {
  numberOfClients: number | null;
  portfolio: number | null;
  current: number | null;
  delayed: number | null;
  pastDue: number | null;
  litigated: number | null;
};

type BarangayNode = {
  id: number;
  name: string;
  zone: string | null;
  region: string | null;
  metrics: Metrics;
  officers: OfficerNode[];
};

type OfficerNode = {
  key: string;
  name: string;
  metrics: Metrics;
};

type MunicipalityNode = {
  name: string;
  metrics: Metrics;
  barangays: BarangayNode[];
};

type ProvinceNode = {
  name: string;
  metrics: Metrics;
  municipalities: Map<string, MunicipalityNode>;
};

type MetricAccumulator = {
  clients: Set<number>;
  portfolio: number;
  currentClients: Set<number>;
  delayedClients: Set<number>;
  pastDueClients: Set<number>;
  litigatedClients: Set<number>;
};

const provinceAliases: Record<string, string> = {
  adn: "agusan del norte",
  ads: "agusan del sur",
  sdn: "surigao del norte",
  sds: "surigao del sur"
};

function normalizedText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function normalizedProvince(value: string) {
  const key = normalizedText(value);
  return provinceAliases[key] ?? key;
}

function normalizedMunicipality(value: string) {
  const key = normalizedText(value);
  if (key === "btc") return "butuan";
  return key.replace(/^city of\s+/, "").replace(/\s+city$/, "");
}

function normalizedBarangay(value: string) {
  return normalizedText(value)
    .replace(/\s*\(\s*barangay\s+\d+[^)]*\)\s*$/i, "")
    .replace(/\s+pob\.?$/i, "")
    .replace(/^(?:barangay|brgy)\.?\s+/, "");
}

function barangayAliases(value: string) {
  const aliases = new Set([normalizedBarangay(value)]);
  const numberedBarangay = normalizedText(value).match(/\(\s*barangay\s+(\d+)[^)]*\)\s*$/i);
  if (numberedBarangay) aliases.add(numberedBarangay[1]);
  return Array.from(aliases).filter(Boolean);
}

function locationKey(province: string, municipality: string, barangay: string) {
  return `${normalizedProvince(province)}\u0000${normalizedMunicipality(municipality)}\u0000${normalizedBarangay(barangay)}`;
}

function municipalityBarangayKey(municipality: string, barangay: string) {
  return `${normalizedMunicipality(municipality)}\u0000${normalizedBarangay(barangay)}`;
}

type MasterlistLocation = {
  province: string;
  municipality: string;
  barangay: string;
};

function resolveMasterlistLocation(
  assignment: { province: string | null; municipality: string | null; barangay: string | null },
  address: string | null,
  masterlistByKey: Map<string, MasterlistLocation>,
  masterlistByMunicipalityBarangay: Map<string, MasterlistLocation[]>,
  masterlistByBarangay: Map<string, MasterlistLocation[]>
) {
  if (!assignment.barangay) return null;
  if (assignment.province && assignment.municipality) {
    const exact = masterlistByKey.get(locationKey(assignment.province, assignment.municipality, assignment.barangay));
    if (exact) return exact;
  }

  if (assignment.municipality) {
    const municipalityCandidates = barangayAliases(assignment.barangay).flatMap(
      (barangay) => masterlistByMunicipalityBarangay.get(municipalityBarangayKey(assignment.municipality!, barangay)) ?? []
    );
    const uniqueMunicipalityCandidates = Array.from(
      new Map(municipalityCandidates.map((candidate) => [locationKey(candidate.province, candidate.municipality, candidate.barangay), candidate])).values()
    );
    if (uniqueMunicipalityCandidates.length === 1) return uniqueMunicipalityCandidates[0];
  }

  const candidates = barangayAliases(assignment.barangay).flatMap(
    (barangay) => masterlistByBarangay.get(barangay) ?? []
  );
  const uniqueCandidates = Array.from(
    new Map(candidates.map((candidate) => [locationKey(candidate.province, candidate.municipality, candidate.barangay), candidate])).values()
  );
  if (uniqueCandidates.length === 1) return uniqueCandidates[0];
  if (!uniqueCandidates.length) return null;

  const normalizedAddress = normalizedText(address ?? "");
  const scored = uniqueCandidates.map((candidate) => {
    let score = 0;
    if (assignment.municipality && normalizedMunicipality(assignment.municipality) === normalizedMunicipality(candidate.municipality)) score += 8;
    if (assignment.province && normalizedProvince(assignment.province) === normalizedProvince(candidate.province)) score += 6;
    const municipality = normalizedMunicipality(candidate.municipality);
    const province = normalizedProvince(candidate.province);
    if (municipality && normalizedAddress.includes(municipality)) score += 4;
    if (province && normalizedAddress.includes(province)) score += 3;
    return { candidate, score };
  }).sort((a, b) => b.score - a.score);

  if (scored[0].score > 0 && scored[0].score > (scored[1]?.score ?? -1)) return scored[0].candidate;
  return null;
}

function emptyAccumulator(): MetricAccumulator {
  return {
    clients: new Set(),
    portfolio: 0,
    currentClients: new Set(),
    delayedClients: new Set(),
    pastDueClients: new Set(),
    litigatedClients: new Set()
  };
}

function accumulatedMetrics(accumulator?: MetricAccumulator): Metrics {
  if (!accumulator) {
    return { numberOfClients: 0, portfolio: 0, current: 0, delayed: 0, pastDue: 0, litigated: 0 };
  }
  return {
    numberOfClients: accumulator.clients.size,
    portfolio: accumulator.portfolio,
    current: accumulator.currentClients.size,
    delayed: accumulator.delayedClients.size,
    pastDue: accumulator.pastDueClients.size,
    litigated: accumulator.litigatedClients.size
  };
}

function addLoanMetrics(
  target: Map<string, MetricAccumulator>,
  key: string,
  loan: { clientId: number; balance: unknown; sourceStatusName: string | null }
) {
  const accumulator = target.get(key) ?? emptyAccumulator();
  accumulator.clients.add(loan.clientId);
  accumulator.portfolio += Number(loan.balance);
  const status = normalizedText(loan.sourceStatusName ?? "");
  if (status.includes("litig")) accumulator.litigatedClients.add(loan.clientId);
  else if (status.includes("past") || status.includes("overdue") || status.includes("arrears")) accumulator.pastDueClients.add(loan.clientId);
  else if (status.includes("delay")) accumulator.delayedClients.add(loan.clientId);
  else if (status.includes("current")) accumulator.currentClients.add(loan.clientId);
  target.set(key, accumulator);
}

function aggregateMetrics(items: Metrics[]): Metrics {
  const total = (field: keyof Metrics) => {
    const values = items.map((item) => item[field]).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  return {
    numberOfClients: total("numberOfClients"),
    portfolio: total("portfolio"),
    current: total("current"),
    delayed: total("delayed"),
    pastDue: total("pastDue"),
    litigated: total("litigated")
  };
}

function count(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function money(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
}

const rowGrid = "grid min-w-[1080px] grid-cols-[minmax(300px,1fr)_100px_160px_repeat(4,90px)] items-center";

export default async function LocationMasterlistPage() {
  const user = await requireUser(["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"]);
  const accessibleBranchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const branchWhere: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const [locations, loans] = await Promise.all([
    prisma.locationMasterlist.findMany({
      orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }]
    }),
    prisma.loan.findMany({
      where: {
        AND: [
          branchWhere,
          accountTaggingSearchWhere({}),
          {
            remedialAssignment: {
              is: {
                status: "ACTIVE",
                ...(user.role === "ACCOUNT_OFFICER" ? { assignedToId: user.id } : {}),
                barangay: { not: null }
              }
            }
          }
        ]
      },
      select: {
        clientId: true,
        balance: true,
        sourceStatusName: true,
        client: { select: { address: true } },
        remedialAssignment: {
          select: {
            province: true,
            municipality: true,
            barangay: true,
            assignedToId: true,
            assignedTo: { select: { name: true } }
          }
        }
      }
    })
  ]);

  const metricsByProvince = new Map<string, MetricAccumulator>();
  const metricsByMunicipality = new Map<string, MetricAccumulator>();
  const metricsByLocation = new Map<string, MetricAccumulator>();
  const metricsByLocationOfficer = new Map<string, MetricAccumulator>();
  const officerNames = new Map<string, string>();
  const masterlistByKey = new Map<string, MasterlistLocation>();
  const masterlistByMunicipalityBarangay = new Map<string, MasterlistLocation[]>();
  const masterlistByBarangay = new Map<string, MasterlistLocation[]>();
  for (const location of locations) {
    const item = { province: location.province, municipality: location.municipality, barangay: location.barangay };
    masterlistByKey.set(locationKey(item.province, item.municipality, item.barangay), item);
    for (const barangayKey of barangayAliases(item.barangay)) {
      const municipalityKey = municipalityBarangayKey(item.municipality, barangayKey);
      masterlistByMunicipalityBarangay.set(
        municipalityKey,
        [...(masterlistByMunicipalityBarangay.get(municipalityKey) ?? []), item]
      );
      masterlistByBarangay.set(barangayKey, [...(masterlistByBarangay.get(barangayKey) ?? []), item]);
    }
  }
  let matchedLoanCount = 0;
  for (const loan of loans) {
    const assignment = loan.remedialAssignment;
    if (!assignment) continue;
    const matchedLocation = resolveMasterlistLocation(
      assignment,
      loan.client.address,
      masterlistByKey,
      masterlistByMunicipalityBarangay,
      masterlistByBarangay
    );
    if (!matchedLocation) continue;
    matchedLoanCount += 1;
    const barangayKey = locationKey(matchedLocation.province, matchedLocation.municipality, matchedLocation.barangay);
    const provinceKey = normalizedProvince(matchedLocation.province);
    const municipalityKey = `${provinceKey}\u0000${normalizedMunicipality(matchedLocation.municipality)}`;
    addLoanMetrics(metricsByProvince, provinceKey, loan);
    addLoanMetrics(metricsByMunicipality, municipalityKey, loan);
    addLoanMetrics(metricsByLocation, barangayKey, loan);
    const officerKey = assignment.assignedToId === null ? "unassigned" : String(assignment.assignedToId);
    officerNames.set(officerKey, assignment.assignedTo?.name ?? "Unassigned");
    addLoanMetrics(metricsByLocationOfficer, `${barangayKey}\u0000${officerKey}`, loan);
  }

  const provinces = new Map<string, ProvinceNode>();
  for (const location of locations) {
    const province: ProvinceNode = provinces.get(location.province) ?? {
      name: location.province,
      metrics: aggregateMetrics([]),
      municipalities: new Map<string, MunicipalityNode>()
    };
    const municipality: MunicipalityNode = province.municipalities.get(location.municipality) ?? {
      name: location.municipality,
      metrics: aggregateMetrics([]),
      barangays: []
    };
    municipality.barangays.push({
      id: location.id,
      name: location.barangay,
      zone: location.zone,
      region: location.region,
      metrics: accumulatedMetrics(metricsByLocation.get(locationKey(location.province, location.municipality, location.barangay))),
      officers: Array.from(metricsByLocationOfficer.entries())
        .filter(([key]) => key.startsWith(`${locationKey(location.province, location.municipality, location.barangay)}\u0000`))
        .map(([key, accumulator]) => {
          const officerKey = key.slice(key.lastIndexOf("\u0000") + 1);
          return {
            key: officerKey,
            name: officerNames.get(officerKey) ?? "Unassigned",
            metrics: accumulatedMetrics(accumulator)
          };
        })
        .sort((a, b) => {
          if (a.key === "unassigned") return 1;
          if (b.key === "unassigned") return -1;
          return a.name.localeCompare(b.name);
        })
    });
    const provinceKey = normalizedProvince(location.province);
    const municipalityKey = `${provinceKey}\u0000${normalizedMunicipality(location.municipality)}`;
    municipality.metrics = accumulatedMetrics(metricsByMunicipality.get(municipalityKey));
    province.municipalities.set(location.municipality, municipality);
    province.metrics = accumulatedMetrics(metricsByProvince.get(provinceKey));
    provinces.set(location.province, province);
  }
  const provinceList = Array.from(provinces.values());
  const grandTotal = aggregateMetrics(provinceList.map((province) => province.metrics));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Location reference</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Location Masterlist</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Live outstanding-loan portfolio grouped by tagged province, city/municipality, and barangay.
        </p>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-lg font-bold text-slate-950">Location Pivot</h3>
          <p className="mt-1 text-sm text-slate-600">
            {locations.length.toLocaleString("en-US")} barangay location(s), linked to {matchedLoanCount.toLocaleString("en-US")} of {loans.length.toLocaleString("en-US")} tagged outstanding loan(s).
          </p>
        </div>
        <div className="overflow-x-auto text-sm">
          <div className={`${rowGrid} bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500`}>
            <span>Location</span><span className="text-right">No. of Clients</span><span className="text-right">Portfolio</span>
            <span className="text-right">Current</span><span className="text-right">Delayed</span>
            <span className="text-right">Past Due</span><span className="text-right">Litigated</span>
          </div>
          <div className="min-w-[1080px] divide-y divide-slate-200">
            {provinceList.map((province) => (
              <details key={province.name} className="group">
                <summary className={`${rowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50`}>
                  <span className="font-bold text-slate-950 before:mr-2 before:inline-block before:content-['▶'] group-open:before:rotate-90">{province.name}</span>
                  <MetricCells metrics={province.metrics} />
                </summary>
                <div className="border-t border-slate-100 bg-slate-50/40 pl-6">
                  {Array.from(province.municipalities.values()).map((municipality) => (
                    <details key={municipality.name} className="group/city border-b border-slate-100 last:border-b-0">
                      <summary className={`${rowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50`}>
                        <span className="font-semibold text-slate-800 before:mr-2 before:inline-block before:content-['▶'] group-open/city:before:rotate-90">{municipality.name}</span>
                        <MetricCells metrics={municipality.metrics} />
                      </summary>
                      <div className="border-t border-slate-100 bg-white pl-8">
                        {municipality.barangays.map((barangay) => (
                          <details key={barangay.id} className="group/barangay border-b border-slate-100 last:border-b-0">
                            <summary className={`${rowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50`}>
                            <span className="before:mr-2 before:inline-block before:text-[10px] before:content-['▶'] group-open/barangay:before:rotate-90">
                              <span className="text-slate-700">{barangay.name}</span>
                              {(barangay.zone || barangay.region) ? <span className="ml-2 text-xs text-slate-400">{[barangay.zone, barangay.region].filter(Boolean).join(" • ")}</span> : null}
                            </span>
                              <MetricCells metrics={barangay.metrics} />
                            </summary>
                            <div className="border-t border-slate-100 bg-blue-50/40 pl-8">
                              {barangay.officers.map((officer) => (
                                <div key={officer.key} className={`${rowGrid} border-b border-blue-100 px-4 py-3 last:border-b-0`}>
                                  <span>
                                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Account Officer</span>
                                    <span className="ml-3 font-semibold text-slate-800">{officer.name}</span>
                                  </span>
                                  <MetricCells metrics={officer.metrics} />
                                </div>
                              ))}
                              {!barangay.officers.length ? (
                                <div className="px-4 py-3 font-semibold text-slate-500">No linked outstanding loans.</div>
                              ) : null}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
            {!provinceList.length ? <p className="px-4 py-10 text-center font-semibold text-slate-500">No masterlist locations imported.</p> : null}
          </div>
          {provinceList.length ? (
            <div className={`${rowGrid} border-t-2 border-slate-300 bg-slate-50 px-4 py-3 font-extrabold text-slate-950`}>
              <span>Grand Total</span><MetricCells metrics={grandTotal} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function MetricCells({ metrics }: { metrics: Metrics }) {
  return (
    <>
      <span className="text-right font-bold text-brand-blue">{count(metrics.numberOfClients)}</span>
      <span className="text-right font-bold text-red-700">{money(metrics.portfolio)}</span>
      <span className="text-right">{count(metrics.current)}</span>
      <span className="text-right">{count(metrics.delayed)}</span>
      <span className="text-right">{count(metrics.pastDue)}</span>
      <span className="text-right">{count(metrics.litigated)}</span>
    </>
  );
}
