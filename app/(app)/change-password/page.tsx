import { ChangePasswordForm } from "@/components/change-password-form";
import { requireUser } from "@/lib/auth";

export default async function ChangePasswordPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Account security</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Change Password</h2>
        <p className="mt-2 text-sm text-slate-600">Update your own password after confirming your current password.</p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
