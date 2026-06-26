import { KeyRound, ServerCog, TimerReset } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getMidnightSyncSchedule } from "@/lib/midnight-sync-scheduler";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUser(["ADMIN"]);
  const schedule = getMidnightSyncSchedule();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Configuration</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Settings</h2>
      </div>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="panel p-5">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-blue-50 text-brand-blue">
            <TimerReset className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-slate-950">Midnight Sync Cron</h3>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Automatically syncs online active branches every midnight while the app server is running.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="font-semibold text-slate-500">Status</dt>
              <dd className="font-bold text-slate-950">{schedule.enabled ? "Enabled" : "Disabled"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-semibold text-slate-500">Next run</dt>
              <dd className="font-bold text-slate-950">{dateTime(schedule.nextRunAt)}</dd>
            </div>
          </dl>
        </div>
        <div className="panel p-5">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-brand-green">
            <ServerCog className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-slate-950">Sync Batch Size</h3>
          <p className="mt-4 text-3xl font-bold text-slate-950">{process.env.SYNC_BATCH_SIZE || 500}</p>
          <p className="mt-2 text-sm text-slate-500">Rows requested from each branch table per run.</p>
        </div>
        <div className="panel p-5">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <KeyRound className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-slate-950">Credential Storage</h3>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Branch database passwords are encrypted with AES-256-GCM before storage and decrypted only during sync.
          </p>
        </div>
      </section>
    </div>
  );
}
