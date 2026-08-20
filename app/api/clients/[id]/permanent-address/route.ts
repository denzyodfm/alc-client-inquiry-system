import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { auditAction } from "@/lib/audit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiFunction("CLIENT_INQUIRY");
  if (response) return response;

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: "Invalid client." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const sameAsCurrent = Boolean(body?.sameAsCurrent);
  const permanentAddress = String(body?.permanentAddress ?? "").trim();
  const permanentProvince = String(body?.permanentProvince ?? "").trim();
  const permanentMunicipality = String(body?.permanentMunicipality ?? "").trim();
  const permanentBarangay = String(body?.permanentBarangay ?? "").trim();

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, fullName: true } });
  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: sameAsCurrent
      ? { permanentAddress: null, permanentProvince: null, permanentMunicipality: null, permanentBarangay: null }
      : {
          permanentAddress: permanentAddress || null,
          permanentProvince: permanentProvince || null,
          permanentMunicipality: permanentMunicipality || null,
          permanentBarangay: permanentBarangay || null
        },
    select: { id: true, permanentAddress: true, permanentProvince: true, permanentMunicipality: true, permanentBarangay: true }
  });

  await auditAction(request, user!, "CLIENT_ADDRESS_UPDATE", "Client Inquiry", `${sameAsCurrent ? "Cleared" : "Updated"} the permanent address of ${client.fullName}`);
  return NextResponse.json({ ok: true, client: updated });
}
