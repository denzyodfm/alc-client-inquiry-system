import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { isLocationLinkingRunning, linkUnlinkedLoans } from "@/lib/location-linker";

export async function POST() {
  const { user, response } = await requireApiUser(["ADMIN"]);
  if (response) return response;
  if (isLocationLinkingRunning()) {
    return NextResponse.json({ error: "A location-linking run is already in progress." }, { status: 409 });
  }

  try {
    return NextResponse.json(await linkUnlinkedLoans({ trigger: "MANUAL", startedById: user.id }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to link loans.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
