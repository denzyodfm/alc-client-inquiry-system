// Re-encrypts every stored branch database password from one SYNC_ENCRYPTION_KEY to another.
//
// The key in .env is not just a secret - it is the only way to read the branch credentials
// already in the database. Replacing it without re-encrypting leaves every branch unable to
// sync until each password is typed in again by hand.
//
// Usage (old key from .env, new key passed in):
//   OLD_SYNC_ENCRYPTION_KEY="$(grep ^SYNC_ENCRYPTION_KEY= .env | cut -d= -f2- | tr -d '"')" \
//   NEW_SYNC_ENCRYPTION_KEY='the-new-key' \
//   npx tsx scripts/rotate-sync-key.ts
//
// It prints what it would do and changes nothing unless APPLY=1 is set. Take a database
// backup first; this rewrites credentials.

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const ALGORITHM = "aes-256-gcm";
const prisma = new PrismaClient();

function keyFrom(secret: string) {
  return crypto.createHash("sha256").update(secret).digest();
}

function decrypt(value: string, secret: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  // Matches lib/crypto.ts: a value that is not in the encrypted shape is stored as plain text.
  if (!ivText || !tagText || !encryptedText) return value;
  const decipher = crypto.createDecipheriv(ALGORITHM, keyFrom(secret), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

function encrypt(value: string, secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyFrom(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

async function main() {
  const oldKey = process.env.OLD_SYNC_ENCRYPTION_KEY;
  const newKey = process.env.NEW_SYNC_ENCRYPTION_KEY;
  const apply = process.env.APPLY === "1";

  if (!oldKey || !newKey) {
    console.error("Set OLD_SYNC_ENCRYPTION_KEY and NEW_SYNC_ENCRYPTION_KEY.");
    process.exit(1);
  }
  if (newKey.length < 32) {
    console.error("NEW_SYNC_ENCRYPTION_KEY should be at least 32 characters.");
    process.exit(1);
  }

  const branches = await prisma.branch.findMany({ select: { id: true, branchCode: true, branchName: true, encryptedDbPassword: true } });
  const rewrites: Array<{ id: number; code: string; value: string }> = [];

  for (const branch of branches) {
    try {
      const plain = decrypt(branch.encryptedDbPassword, oldKey);
      if (!plain) {
        console.error(`  ${branch.branchCode}: decrypted to an empty value - skipping`);
        continue;
      }
      const reencrypted = encrypt(plain, newKey);
      // Prove the new value reads back before it is trusted.
      if (decrypt(reencrypted, newKey) !== plain) {
        console.error(`  ${branch.branchCode}: re-encrypted value did not verify - stopping`);
        process.exit(1);
      }
      rewrites.push({ id: branch.id, code: branch.branchCode, value: reencrypted });
      console.log(`  ${branch.branchCode} (${branch.branchName}): ready`);
    } catch {
      console.error(`  ${branch.branchCode}: could not decrypt with the old key - stopping so nothing is lost`);
      process.exit(1);
    }
  }

  if (!apply) {
    console.log(`\n${rewrites.length} branch password(s) would be re-encrypted. Re-run with APPLY=1 to write them.`);
    await prisma.$disconnect();
    return;
  }

  for (const rewrite of rewrites) {
    await prisma.branch.update({ where: { id: rewrite.id }, data: { encryptedDbPassword: rewrite.value } });
  }
  console.log(`\nRe-encrypted ${rewrites.length} branch password(s). Put the new key in .env and restart the app.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
