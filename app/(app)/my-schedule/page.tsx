import { CalendarDays, UserRound } from "lucide-react";
import { OfficerLogCalendar } from "@/components/officer-log-calendar";
import { requireFunction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { officerChoiceFor, canReadOfficer } from "@/lib/officer-scope";
import { OfficerPicker } from "../my-clients/officer-picker";

export const dynamic = "force-dynamic";

// An officer's own follow-up and promise-to-pay dates, as a calendar. The same schedule was
// already reachable by clicking a name in the client logs table; this makes it a layout of its
// own, because it is what an officer plans their day from rather than something they look up.

const officerSelect = {
  id: true,
  name: true,
  privilegeTemplate: { select: { name: true } },
  area: { select: { name: true } },
  baseBranch: { select: { branchName: true, branchCode: true } }
} as const;

export default async function MySchedulePage({
  searchParams
}: {
  searchParams?: Promise<{ officerId?: string }>;
}) {
  const user = await requireFunction("MY_SCHEDULE");
  const params = await searchParams;
  const isOfficer = user.role === "ACCOUNT_OFFICER";

  const choice = await officerChoiceFor(user);
  const requestedId = Number(params?.officerId ?? 0) || null;
  const officerId = choice.mode === "self"
    ? choice.officerId
    : requestedId && (await canReadOfficer(user, requestedId)) ? requestedId : null;

  const selectedOfficer = officerId
    ? await prisma.user.findFirst({ where: { id: officerId, role: "ACCOUNT_OFFICER" }, select: officerSelect })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">My Schedule</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
          {isOfficer || !selectedOfficer ? "My Schedule" : selectedOfficer.name.toLocaleUpperCase("en")}
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
          <CalendarDays className="h-4 w-4 text-brand-blue" />
          Follow-up and promise-to-pay dates recorded on client logs.
        </p>
      </div>

      {choice.mode === "choose"
        ? <OfficerPicker scopes={choice.scopes} officers={choice.officers} selectedId={selectedOfficer?.id ?? null} basePath="/my-schedule" subject="schedule" />
        : null}

      {selectedOfficer ? (
        <OfficerLogCalendar officerId={selectedOfficer.id} officerName={selectedOfficer.name} variant="inline" />
      ) : (
        <div className="panel p-10 text-center">
          <UserRound className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">No officer selected.</p>
          <p className="mt-1 text-sm text-slate-500">Choose an officer above to see their schedule.</p>
        </div>
      )}
    </div>
  );
}
