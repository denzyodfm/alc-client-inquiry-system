import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { canAccessAnyFunction } from "@/lib/access-control";
import { canAccessBranch } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  if (!(await canAccessAnyFunction(user!, ["CLIENT_INQUIRY", "LOCATION_MASTERLIST", "ACCOUNT_TAGGING", "REMEDIAL"]))) {
    return NextResponse.json({ error: "You do not have permission to update client address pins." }, { status: 403 });
  }
  const id = Number((await context.params).id);
  const body = await request.json().catch(() => null);
  const latitude = Number(body?.latitude); const longitude = Number(body?.longitude);
  const accuracy = body?.accuracy === null || body?.accuracy === undefined || body?.accuracy === "" ? null : Number(body.accuracy);
  const source = String(body?.source ?? "MANUAL").trim().toLocaleUpperCase("en").slice(0, 80);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0))) {
    return NextResponse.json({ error: "Enter valid latitude and longitude values." }, { status: 400 });
  }
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, branchId: true, fullName: true, address: true } });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (!(await canAccessBranch(user!, client.branchId))) return NextResponse.json({ error: "This client is outside your assigned branches." }, { status: 403 });
  const updated = await prisma.client.update({ where: { id }, data: { addressLatitude: latitude, addressLongitude: longitude, addressAccuracy: accuracy, addressCoordinateSource: source || "MANUAL", addressGeocodedAt: new Date(), addressCapturedBy: user!.name }, select: { addressLatitude: true, addressLongitude: true, addressAccuracy: true, addressCoordinateSource: true, addressGeocodedAt: true, addressCapturedBy: true } });
  await auditAction(request, user!, "CLIENT_ADDRESS_PIN_SAVE", "Client Address", `Saved address pin for ${client.fullName} (${client.address ?? "no address"}) at ${latitude}, ${longitude}${accuracy === null ? "" : ` ±${accuracy}m`}`, { includeAdmin: true });
  return NextResponse.json({ pin: serialize(updated) });
}

function serialize(pin: { addressLatitude: unknown; addressLongitude: unknown; addressAccuracy: unknown; addressCoordinateSource: string | null; addressGeocodedAt: Date | null; addressCapturedBy: string | null }) {
  return { latitude: Number(pin.addressLatitude), longitude: Number(pin.addressLongitude), accuracy: pin.addressAccuracy === null ? null : Number(pin.addressAccuracy), source: pin.addressCoordinateSource, capturedAt: pin.addressGeocodedAt?.toISOString() ?? null, capturedBy: pin.addressCapturedBy };
}
