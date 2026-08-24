import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_VALUE_LENGTH = 20000;

// Small per-account view settings, such as a hand-arranged row order. Everything here is
// read and written for the signed-in account only, so one user's layout is invisible to
// everyone else.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A page can hold many independently arranged lists, so several keys may be read at once
  // rather than one request per list.
  const keys = (request.nextUrl.searchParams.get("keys") ?? request.nextUrl.searchParams.get("key") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 300);
  if (!keys.length) return NextResponse.json({ error: "A preference key is required." }, { status: 400 });

  const preferences = await prisma.userPreference.findMany({
    where: { userId: user.id, key: { in: keys } },
    select: { key: true, value: true }
  });
  const values = Object.fromEntries(keys.map((key) => [key, preferences.find((row) => row.key === key)?.value ?? null]));
  return NextResponse.json({ values, key: keys[0], value: values[keys[0]] });
}

export async function PUT(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const key = String(body?.key ?? "").trim().slice(0, 120);
  if (!key) return NextResponse.json({ error: "A preference key is required." }, { status: 400 });

  // A null value clears the setting, which is how "reset to the default order" is stored.
  if (body?.value === null) {
    await prisma.userPreference.deleteMany({ where: { userId: user.id, key } });
    return NextResponse.json({ ok: true, cleared: true });
  }

  const value = typeof body?.value === "string" ? body.value : JSON.stringify(body?.value ?? null);
  if (value.length > MAX_VALUE_LENGTH) {
    return NextResponse.json({ error: "That preference is too large to store." }, { status: 400 });
  }

  await prisma.userPreference.upsert({
    where: { userId_key: { userId: user.id, key } },
    create: { userId: user.id, key, value },
    update: { value }
  });
  return NextResponse.json({ ok: true });
}
