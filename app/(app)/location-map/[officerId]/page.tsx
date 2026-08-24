import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPinned } from "lucide-react";
import { OfficerPortfolioMap } from "@/components/officer-portfolio-map";
import { getAccessibleBranchIds, requireFunction } from "@/lib/auth";
import { officerAccountFamily } from "@/lib/officer-account";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OfficerLocationMapPage({ params, searchParams }: { params: Promise<{ officerId: string }>; searchParams?: Promise<{ province?: string; municipality?: string; locationId?: string }> }) {
  const user = await requireFunction("LOCATION_MASTERLIST");
  const officerId = Number((await params).officerId);
  const filters = await searchParams;
  const requestedLocationId = Number(filters?.locationId);
  if (!Number.isInteger(officerId) || officerId <= 0) notFound();

  const family = await officerAccountFamily(officerId);
  if (!family) notFound();
  if (user.role === "ACCOUNT_OFFICER" && !family.accountIds.includes(user.id)) notFound();

  const accessibleBranchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const branchWhere = accessibleBranchIds === null
    ? {}
    : accessibleBranchIds.length
      ? { branchId: { in: accessibleBranchIds } }
      : { branchId: -1 };

  const grouped = await prisma.loan.groupBy({
    by: ["locationMasterlistId"],
    where: {
      ...branchWhere,
      balance: { gt: 0 },
      locationLinked: true,
      locationMasterlistId: { not: null },
      remedialAssignment: { is: { status: "ACTIVE", assignedToId: { in: family.accountIds } } }
    },
    _count: { _all: true }
  });
  const locationIds = grouped.map((row) => row.locationMasterlistId).filter((id): id is number => id !== null);
  const masterlist = await prisma.locationMasterlist.findMany({
    where: { id: { in: locationIds } },
    orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }],
    select: { id: true, province: true, municipality: true, barangay: true }
  });
  const counts = new Map(grouped.map((row) => [row.locationMasterlistId, row._count._all]));
  const locations = masterlist
    .filter((location) => !filters?.province || location.province === filters.province)
    .filter((location) => !filters?.municipality || location.municipality === filters.municipality)
    .filter((location) => !Number.isInteger(requestedLocationId) || requestedLocationId <= 0 || location.id === requestedLocationId)
    .map((location) => ({ ...location, loans: counts.get(location.id) ?? 0 }));
  const scopeLabel = Number.isInteger(requestedLocationId) && requestedLocationId > 0
    ? locations[0]?.barangay
    : filters?.municipality || filters?.province || "All assigned locations";

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-green"><MapPinned className="h-4 w-4" />Officer Location Map</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">{family.canonicalName}</h2>
          <p className="mt-1 text-sm text-slate-600">Collection plan: {scopeLabel}. Select a barangay pin to view its assigned clients and balances.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/location-masterlist" className="btn-secondary h-9 px-3 text-xs">
            <ArrowLeft className="h-4 w-4" />Back to Location Masterlist
          </Link>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-brand-blue">{locations.length.toLocaleString("en-US")} mapped location(s)</span>
        </div>
      </header>
      <OfficerPortfolioMap officerId={family.canonicalId} officerName={family.canonicalName} locations={locations} />
    </div>
  );
}
