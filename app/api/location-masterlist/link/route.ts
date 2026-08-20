import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { isLocationLinkingRunning, linkUnlinkedLoans } from "@/lib/location-linker";
import { auditAction } from "@/lib/audit";

export async function POST(request: Request) {
  const { user, response } = await requireApiFunction("LOCATION_MASTERLIST");
  if (response) return response;
  if (isLocationLinkingRunning()) {
    return NextResponse.json({ error: "A location-linking run is already in progress." }, { status: 409 });
  }

  try {
    const result = await linkUnlinkedLoans({ trigger: "MANUAL", startedById: user.id });
    await auditAction(request, user, "LOCATION_LINK_RUN", "Location Masterlist", "Started a location linking run");
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to link loans.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
