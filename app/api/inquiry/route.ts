import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { canSeeEmployeeLoans } from "@/lib/employee-loans";
import { searchClientInquiry } from "@/lib/inquiry";

export async function POST(request: Request) {
  const { user, response } = await requireApiFunction("CLIENT_INQUIRY");
  if (response) return response;

  const payload = await request.json();
  const result = await searchClientInquiry(payload, { hideEmployeeLoans: !(user && (await canSeeEmployeeLoans(user))) });
  return NextResponse.json(result);
}
