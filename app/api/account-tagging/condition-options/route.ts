import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { auditAction } from "@/lib/audit";

export async function POST(request: Request) {
  const { user, response } = await requireApiFunction("ACCOUNT_TAGGING");
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const name = String((await request.json()).name ?? "").trim().toUpperCase();
  if (!name || name.length > 20 || /[\u0000-\u001f\u007f]/.test(name)) {
    return NextResponse.json({ error: "Enter a condition using 20 characters or fewer." }, { status: 400 });
  }

  await prisma.clientConditionOption.upsert({
    where: { name },
    create: { name },
    update: {}
  });

  await auditAction(request, user, "CLIENT_CONDITION_OPTION_ADD", "Client Condition", `Added the client condition option ${name}`);
  return NextResponse.json({ ok: true, name });
}
