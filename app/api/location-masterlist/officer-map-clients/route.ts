import { NextRequest, NextResponse } from "next/server";
import { getAccessibleBranchIds } from "@/lib/auth";
import { requireApiFunction } from "@/lib/api";
import { officerAccountFamily } from "@/lib/officer-account";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiFunction("LOCATION_MASTERLIST");
  if (response) return response;
  const officerId = Number(request.nextUrl.searchParams.get("officerId"));
  const locationId = Number(request.nextUrl.searchParams.get("locationId"));
  if (!Number.isInteger(officerId) || officerId <= 0 || !Number.isInteger(locationId) || locationId <= 0) {
    return NextResponse.json({ error: "A valid officer and barangay are required." }, { status: 400 });
  }
  const family = await officerAccountFamily(officerId);
  if (!family) return NextResponse.json({ error: "Account Officer not found." }, { status: 404 });
  if (user.role === "ACCOUNT_OFFICER" && !family.accountIds.includes(user.id)) {
    return NextResponse.json({ error: "You can view only your assigned clients." }, { status: 403 });
  }
  const branchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const branchWhere = branchIds === null ? {} : branchIds.length ? { branchId: { in: branchIds } } : { branchId: -1 };
  const loans = await prisma.loan.findMany({
    where: {
      ...branchWhere,
      balance: { gt: 0 },
      locationLinked: true,
      locationMasterlistId: locationId,
      remedialAssignment: { is: { status: "ACTIVE", assignedToId: { in: family.accountIds } } }
    },
    select: {
      clientId: true,
      loanNumber: true,
      balance: true,
      client: { select: { fullName: true, clientId: true } }
    },
    orderBy: { client: { fullName: "asc" } }
  });
  const clients = new Map<number, { id: number; name: string; clientNumber: string | null; loans: number; balance: number }>();
  for (const loan of loans) {
    const existing = clients.get(loan.clientId) ?? { id: loan.clientId, name: loan.client.fullName, clientNumber: loan.client.clientId, loans: 0, balance: 0 };
    existing.loans += 1;
    existing.balance += Number(loan.balance);
    clients.set(loan.clientId, existing);
  }
  return NextResponse.json({ officerName: family.canonicalName, clients: Array.from(clients.values()) });
}
