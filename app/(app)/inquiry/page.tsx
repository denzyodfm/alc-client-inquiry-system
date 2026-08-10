import { InquiryForm } from "@/components/inquiry-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function InquiryPage() {
  const locationOptions = await prisma.locationMasterlist.findMany({
    distinct: ["province", "municipality", "barangay"],
    select: { province: true, municipality: true, barangay: true },
    orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }]
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Client verification</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Client Inquiry</h2>
      </div>
      <InquiryForm locationOptions={locationOptions} />
    </div>
  );
}
