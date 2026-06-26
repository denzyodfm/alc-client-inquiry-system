import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { searchClientInquiry } from "@/lib/inquiry";

export async function POST(request: Request) {
  const { response } = await requireApiUser();
  if (response) return response;

  const payload = await request.json();
  const result = await searchClientInquiry(payload);
  return NextResponse.json(result);
}
