import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { Prisma } from "@prisma/client";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const requiredFields = ["branchName", "branchCode", "dbHost", "dbName", "dbUser"];
    const missingField = requiredFields.find((field) => !String(body[field] ?? "").trim());

    if (missingField) {
      return NextResponse.json({ error: "Please complete all required branch fields." }, { status: 400 });
    }

    const branch = await prisma.branch.update({
      where: { id: Number(id) },
      data: {
        branchName: String(body.branchName).trim(),
        branchCode: String(body.branchCode).trim(),
        publicIp: String(body.publicIp ?? "").trim() || null,
        dbHost: String(body.dbHost).trim(),
        dbName: String(body.dbName).trim(),
        dbUser: String(body.dbUser).trim(),
        encryptedDbPassword: String(body.dbPassword ?? "").trim() ? encryptSecret(String(body.dbPassword)) : undefined,
        status: body.status || "ACTIVE"
      }
    });
    const { encryptedDbPassword: _encryptedDbPassword, ...safeBranch } = branch;
    return NextResponse.json(safeBranch);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A branch with this code already exists." }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    }

    console.error("Failed to update branch", error);
    return NextResponse.json({ error: "Unable to update branch." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  try {
    const { id } = await context.params;
    await prisma.branch.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    }

    console.error("Failed to delete branch", error);
    return NextResponse.json({ error: "Unable to delete branch." }, { status: 500 });
  }
}
