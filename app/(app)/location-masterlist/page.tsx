import { requireUser } from "@/lib/auth";
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
  await requireUser(["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"]);
  const locations = await prisma.locationMasterlist.findMany({
    orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }]
  });

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
      metrics: {
        numberOfClients: location.numberOfClients,
        portfolio: location.portfolio === null ? null : Number(location.portfolio),
        current: location.current,
        delayed: location.delayed,
        pastDue: location.pastDue,
        litigated: location.litigated
      }
    });
    municipality.metrics = aggregateMetrics(municipality.barangays.map((item) => item.metrics));
    province.municipalities.set(location.municipality, municipality);
    province.metrics = aggregateMetrics(Array.from(province.municipalities.values()).map((item) => item.metrics));
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
          Province, city/municipality, and barangay hierarchy prepared for future loan matching and pivot reporting.
        </p>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-lg font-bold text-slate-950">Location Pivot</h3>
          <p className="mt-1 text-sm text-slate-600">
            {locations.length.toLocaleString("en-US")} barangay location(s). Metrics remain blank until loan matching is enabled.
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
                          <div key={barangay.id} className={`${rowGrid} border-b border-slate-100 px-4 py-3 last:border-b-0`}>
                            <span>
                              <span className="text-slate-700">{barangay.name}</span>
                              {(barangay.zone || barangay.region) ? <span className="ml-2 text-xs text-slate-400">{[barangay.zone, barangay.region].filter(Boolean).join(" • ")}</span> : null}
                            </span>
                            <MetricCells metrics={barangay.metrics} />
                          </div>
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
