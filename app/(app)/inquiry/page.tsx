import { InquiryForm } from "@/components/inquiry-form";

export default function InquiryPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Client verification</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Client Inquiry</h2>
      </div>
      <InquiryForm />
    </div>
  );
}
