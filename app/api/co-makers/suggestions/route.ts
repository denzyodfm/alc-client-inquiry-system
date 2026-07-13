import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api";
import { inactiveStatus12Where } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";

function searchTokens(value: string) {
  return value
    .trim()
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function coMakerTokenWhere(tokens: string[]): Prisma.CoMakerWhereInput {
  return tokens.length
    ? {
        AND: tokens.map((token) => ({
          OR: [
            { name: { contains: token } },
            { clientRemoteId: { contains: token } },
            { validIdNumber: { contains: token } },
            { contactNumber: { contains: token } },
            { address: { contains: token } }
          ]
        }))
      }
    : {};
}

function normalizeCoMakerText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCoMakerKey(coMaker: { clientRemoteId: string | null; validIdNumber: string | null; name: string; address?: string | null }) {
  const normalizedName = normalizeCoMakerText(coMaker.name);
  const normalizedAddress = normalizeCoMakerText(coMaker.address);

  if (normalizedName && normalizedAddress) {
    return `person:${normalizedName}|${normalizedAddress}`;
  }

  return `id:${normalizeCoMakerText(coMaker.clientRemoteId || coMaker.validIdNumber || coMaker.name)}`;
}

export async function GET(request: Request) {
  const { response } = await requireApiUser();
  if (response) return response;

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const tokens = searchTokens(query);
  if (!tokens.length) return NextResponse.json({ suggestions: [] });

  const rows = await prisma.coMaker.findMany({
    where: {
      AND: [
        coMakerTokenWhere(tokens),
        { loan: inactiveStatus12Where() }
      ]
    },
    orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
    select: {
      name: true,
      clientRemoteId: true,
      validIdNumber: true,
      contactNumber: true,
      address: true
    },
    take: 100
  });

  const seen = new Set<string>();
  const suggestions = [];

  for (const row of rows) {
    const key = normalizeCoMakerKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      name: row.name,
      clientRemoteId: row.clientRemoteId,
      validIdNumber: row.validIdNumber,
      contactNumber: row.contactNumber
    });
    if (suggestions.length >= 8) break;
  }

  return NextResponse.json({ suggestions });
}
