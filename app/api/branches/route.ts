import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { checkBranchConnection } from "@/scripts/sync-service";
import { Prisma } from "@prisma/client";

export async function GET() {
  const { response } = await requireApiUser();
  if (response) return response;

  const branches = await prisma.branch.findMany({
    orderBy: { branchName: "asc" },
    include: {
      syncLogs: {
        take: 1,
        orderBy: { startedAt: "desc" }
      }
    }
  });
  const branchesWithConnection = await Promise.all(
    branches.map(async (branch) => {
      const connection = await checkBranchConnection(branch);
      const { encryptedDbPassword: _encryptedDbPassword, ...safeBranch } = branch;
      return { ...safeBranch, connection };
    })
  );

  return NextResponse.json(branchesWithConnection);
}

export async function POST(request: Request) {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  try {
    const body = await request.json();
    const requiredFields = ["branchName", "branchCode", "dbHost", "dbName", "dbUser", "dbPassword"];
    const missingField = requiredFields.find((field) => !String(body[field] ?? "").trim());

    if (missingField) {
      return NextResponse.json({ error: "Please complete all required branch fields." }, { status: 400 });
    }

    const branch = await prisma.branch.create({
      data: {
        branchName: String(body.branchName).trim(),
        branchCode: String(body.branchCode).trim(),
        publicIp: String(body.publicIp ?? "").trim() || null,
        dbHost: String(body.dbHost).trim(),
        dbName: String(body.dbName).trim(),
        dbUser: String(body.dbUser).trim(),
        encryptedDbPassword: encryptSecret(String(body.dbPassword)),
        status: body.status || "ACTIVE"
      }
    });
    const { encryptedDbPassword: _encryptedDbPassword, ...safeBranch } = branch;
    return NextResponse.json(safeBranch, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A branch with this code already exists." }, { status: 409 });
    }

    console.error("Failed to create branch", error);
    return NextResponse.json({ error: "Unable to save branch." }, { status: 500 });
  }
}
