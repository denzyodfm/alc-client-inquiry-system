import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { getMidnightSyncSchedule } from "@/lib/midnight-sync-scheduler";
import { getFooterBranding } from "@/lib/footer-branding";
import { prisma } from "@/lib/prisma";
import { auditAction } from "@/lib/audit";

export async function GET() {
  const { response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;

  return NextResponse.json({
    midnightCron: getMidnightSyncSchedule(),
    batchSize: Number(process.env.SYNC_BATCH_SIZE || 500),
    databaseProvider: "Microsoft SQL Server branch databases",
    passwordEncryption: "AES-256-GCM",
    footerBranding: await getFooterBranding()
  });
}

export async function PATCH(request: Request) {
  const { user, response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;
  const body = await request.json().catch(() => null);
  const poweredByLabel = String(body?.poweredByLabel ?? "").trim();
  const partnerName = String(body?.partnerName ?? "").trim();
  const itTeamLabel = String(body?.itTeamLabel ?? "").trim();
  if (!poweredByLabel || !partnerName || !itTeamLabel) return NextResponse.json({ error: "All footer branding fields are required." }, { status: 400 });
  if (poweredByLabel.length > 80 || partnerName.length > 180 || itTeamLabel.length > 180) return NextResponse.json({ error: "One or more footer branding values are too long." }, { status: 400 });
  const footerBranding = await prisma.footerBranding.upsert({
    where: { id: 1 },
    create: { id: 1, poweredByLabel, partnerName, itTeamLabel },
    update: { poweredByLabel, partnerName, itTeamLabel },
    select: { poweredByLabel: true, partnerName: true, itTeamLabel: true }
  });
  await auditAction(request, user!, "SETTINGS_UPDATE", "Settings", "Updated the footer branding");
  return NextResponse.json({ footerBranding });
}
