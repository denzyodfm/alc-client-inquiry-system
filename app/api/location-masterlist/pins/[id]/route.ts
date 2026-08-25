import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser(["ADMIN"]);
  if (response) return response;
  const id = Number((await context.params).id);
  const body = await request.json().catch(() => null);
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "Enter a valid latitude and longitude." }, { status: 400 });
  }
  const location = await prisma.locationMasterlist.findUnique({ where: { id }, select: { province: true, municipality: true, barangay: true } });
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  const updated = await prisma.locationMasterlist.update({
    where: { id },
    data: { latitude, longitude, coordinatePrecision: "MANUAL", coordinateSource: `Manual by ${user!.name}`, geocodedAt: new Date(), geocodeError: null, retryAfter: null },
    select: { latitude: true, longitude: true, coordinatePrecision: true, coordinateSource: true, geocodedAt: true, geocodeError: true, retryAfter: true }
  });
  await auditAction(request, user!, "LOCATION_PIN_MANUAL", "Location Masterlist", `Set manual pin for ${location.barangay}, ${location.municipality}, ${location.province} to ${latitude}, ${longitude}`, { includeAdmin: true });
  return NextResponse.json({ location: { ...updated, latitude: Number(updated.latitude), longitude: Number(updated.longitude), precision: updated.coordinatePrecision, geocodedAt: updated.geocodedAt?.toISOString() ?? null } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser(["ADMIN"]);
  if (response) return response;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  const location = await prisma.locationMasterlist.findUnique({ where: { id }, select: { province: true, municipality: true, barangay: true } });
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  await prisma.locationMasterlist.update({ where: { id }, data: { latitude: null, longitude: null, coordinatePrecision: null, coordinateSource: null, geocodedAt: null, geocodeError: null, retryAfter: null } });
  await auditAction(request, user!, "LOCATION_PIN_RESET", "Location Masterlist", `Reset pin for automatic geocoding: ${location.barangay}, ${location.municipality}, ${location.province}`, { includeAdmin: true });
  return NextResponse.json({ ok: true });
}
