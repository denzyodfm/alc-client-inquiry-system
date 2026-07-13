"use client";

import Link from "next/link";
import { CalendarCheck, CheckCircle2, ClipboardList, MapPinned, Send, XCircle } from "lucide-react";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PrintReportButton } from "@/components/print-report-button";
import { dateOnly, money } from "@/lib/format";

export type RemedialVisitRow = {
  id: number;
  scheduledDate: string;
  scheduleNotes: string | null;
  status: string;
  visitNotes: string | null;
  negotiationNotes: string | null;
  promisedAmount: string;
  paidAmount: string;
  nextVisitDate: string | null;
  approvedByName: string | null;
  createdByName: string | null;
};

export type RemedialLoanRow = {
  id: number;
  loanNumber: string | null;
  remoteId: string;
  releasedAt: string | null;
  maturityAt: string | null;
  due: number;
  paid: number;
  balance: number;
  pastDueDate: string | null;
  daysPastDue: number;
  sourceStatusCode: number | null;
  sourceStatusName: string | null;
  branch: { id: number; branchName: string; branchCode: string };
  client: { fullName: string; clientId: string | null; contactNumber: string | null; address: string | null };
  assignment: {
    id: number;
    status: string;
    assignmentNotes: string | null;
    assignedTo: { id: number; name: string; email: string };
    visits: RemedialVisitRow[];
  } | null;
};

type OfficerOption = {
  id: number;
  name: string;
  email: string;
  allBranches: boolean;
  branchAccess: Array<{ branchId: number }>;
};

type PageLink = {
  page: number;
  href: string;
  showGap: boolean;
};

type RemedialWorkspaceProps = {
  loans: RemedialLoanRow[];
  itineraryLoans: RemedialLoanRow[];
  officers: OfficerOption[];
  canAssign: boolean;
  canApprove: boolean;
  canCreateOwnSchedule: boolean;
  currentUserId: number;
  currentUserName: string;
  firstRowNumber: number;
  totalLoans: number;
  safePage: number;
  totalPages: number;
  firstResult: number;
  lastResult: number;
  previousHref: string;
  nextHref: string;
  pageLinks: PageLink[];
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function latestVisit(loan: RemedialLoanRow) {
  return loan.assignment?.visits[0] ?? null;
}

function visitDateInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function RemedialWorkspace({
  loans,
  itineraryLoans,
  officers,
  canAssign,
  canApprove,
  canCreateOwnSchedule,
  currentUserId,
  currentUserName,
  firstRowNumber,
  totalLoans,
  safePage,
  totalPages,
  firstResult,
  lastResult,
  previousHref,
  nextHref,
  pageLinks
}: RemedialWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [itineraryDate, setItineraryDate] = useState("");
  const [selectedItineraryBranchId, setSelectedItineraryBranchId] = useState<number | null>(null);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const itineraryRows = itineraryLoans
    .flatMap((loan) =>
      (loan.assignment?.visits ?? [])
        .filter((visit) => visit.status === "APPROVED")
        .map((visit) => ({ loan, visit }))
    )
    .sort((a, b) => new Date(a.visit.scheduledDate).getTime() - new Date(b.visit.scheduledDate).getTime());
  const filteredItineraryRows = itineraryDate
    ? itineraryRows.filter(({ visit }) => visitDateInput(visit.scheduledDate) === itineraryDate)
    : itineraryRows;
  const itineraryBranchSummaries = Array.from(
    filteredItineraryRows.reduce((map, row) => {
      const existing = map.get(row.loan.branch.id) ?? {
        branch: row.loan.branch,
        rows: [] as typeof filteredItineraryRows
      };
      existing.rows.push(row);
      map.set(row.loan.branch.id, existing);
      return map;
    }, new Map<number, { branch: RemedialLoanRow["branch"]; rows: typeof filteredItineraryRows }>())
  )
    .map(([, summary]) => ({
      ...summary,
      due: summary.rows.reduce((sum, row) => sum + row.loan.due, 0),
      balance: summary.rows.reduce((sum, row) => sum + row.loan.balance, 0)
    }))
    .sort((a, b) => a.branch.branchName.localeCompare(b.branch.branchName));
  const selectedItinerarySummary =
    itineraryBranchSummaries.find((summary) => summary.branch.id === selectedItineraryBranchId) ?? null;
  const myFollowUps = loans
    .flatMap((loan) =>
      loan.assignment?.assignedTo.id === currentUserId
        ? loan.assignment.visits
            .filter((visit) => visit.status !== "REJECTED")
            .map((visit) => ({ loan, visit }))
        : []
    )
    .sort((a, b) => new Date(a.visit.scheduledDate).getTime() - new Date(b.visit.scheduledDate).getTime());
  const pendingApprovalSchedules = loans
    .flatMap((loan) =>
      (loan.assignment?.visits ?? [])
        .filter((visit) => visit.status === "PENDING_APPROVAL")
        .map((visit) => ({ loan, visit }))
    )
    .sort((a, b) => new Date(a.visit.scheduledDate).getTime() - new Date(b.visit.scheduledDate).getTime());
  const assignedLoans = loans.filter((loan) => loan.assignment?.assignedTo.id === currentUserId && loan.assignment.status === "ACTIVE");
  const unassignedLoans = loans.filter((loan) => !loan.assignment || loan.assignment.status !== "ACTIVE");
  const assignmentSearchTerms = assignmentSearch
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const filteredUnassignedLoans = assignmentSearchTerms.length
    ? unassignedLoans.filter((loan) => {
        const haystack = [
          loan.client.fullName,
          loan.client.clientId,
          loan.client.contactNumber,
          loan.client.address,
          loan.loanNumber,
          loan.remoteId,
          loan.branch.branchName,
          loan.branch.branchCode,
          loan.assignment?.assignedTo.name,
          loan.assignment?.assignedTo.email
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return assignmentSearchTerms.every((term) => haystack.includes(term));
      })
    : unassignedLoans;

  function refresh(message: string) {
    setNotice(message);
    startTransition(() => router.refresh());
  }

  async function submitAssignmentModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const loanIds = form.getAll("loanIds").map((value) => Number(value)).filter((value) => Number.isInteger(value));
    if (!loanIds.length) {
      setError("Select at least one past-due loan to assign.");
      return;
    }

    const response = await fetch("/api/remedial/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loanIds,
        assignedToId: form.get("assignedToId"),
        scheduledDate: form.get("scheduledDate"),
        assignmentNotes: form.get("assignmentNotes"),
        scheduleNotes: form.get("scheduleNotes")
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setError(data?.error ?? "Unable to assign remedial follow-up.");
      return;
    }
    setShowAssignmentModal(false);
    refresh("Remedial follow-up assigned and submitted for approval.");
  }

  async function submitOwnSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const loanIds = form.getAll("loanIds").map((value) => Number(value)).filter((value) => Number.isInteger(value));
    if (!loanIds.length) {
      setError("Select at least one past-due loan for the follow-up schedule.");
      return;
    }

    const response = await fetch("/api/remedial/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loanIds,
        assignedToId: currentUserId,
        scheduledDate: form.get("scheduledDate"),
        scheduleNotes: form.get("scheduleNotes"),
        assignmentNotes: `Follow-up schedule created by ${currentUserName}.`
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setError(data?.error ?? "Unable to create follow-up schedule.");
      return;
    }
    setShowScheduleModal(false);
    refresh("Follow-up schedule created and submitted for approval.");
  }

  async function updateVisit(visitId: number, action: string, payload: Record<string, unknown> = {}) {
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/remedial/visits/${visitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setError(data?.error ?? "Unable to update visit.");
      return;
    }
    if (action === "approve" || action === "reject") setShowApprovalModal(false);
    refresh(action === "approve" ? "Visit schedule approved." : action === "reject" ? "Visit schedule rejected." : "Visit report saved.");
  }

  async function submitVisitReport(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await updateVisit(visitId, "complete", {
      visitNotes: form.get("visitNotes"),
      negotiationNotes: form.get("negotiationNotes"),
      promisedAmount: form.get("promisedAmount"),
      paidAmount: form.get("paidAmount"),
      nextVisitDate: form.get("nextVisitDate"),
      nextVisitNotes: form.get("nextVisitNotes")
    });
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-brand-green">
          <CheckCircle2 className="h-4 w-4" />
          {notice}
        </div>
      ) : null}

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Remedial Layout</p>
            <h3 className="mt-1 text-xl font-bold text-slate-950">Past-due accounts for follow-up</h3>
          </div>
          {canCreateOwnSchedule ? (
            <button type="button" className="btn-primary h-10 px-4" onClick={() => setShowScheduleModal(true)}>
              <CalendarCheck className="h-4 w-4" />
              Create follow-up schedule
            </button>
          ) : null}
          {canAssign ? (
            <button
              type="button"
              className="btn-primary h-10 px-4"
              onClick={() => {
                setAssignmentSearch("");
                setShowAssignmentModal(true);
              }}
            >
              <ClipboardList className="h-4 w-4" />
              Assign remedial follow-up
            </button>
          ) : null}
          {canApprove ? (
            <button type="button" className="btn-secondary h-10 px-4" onClick={() => setShowApprovalModal(true)}>
              <CheckCircle2 className="h-4 w-4" />
              Approve follow-up schedules
              {pendingApprovalSchedules.length ? ` (${pendingApprovalSchedules.length})` : ""}
            </button>
          ) : null}
        </div>

        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <MapPinned className="h-5 w-5 text-brand-blue" />
            <h3 className="font-bold text-slate-950">Officer Itinerary</h3>
          </div>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Filter follow-up date
            <input
              type="date"
              className="field h-10 min-w-52"
              value={itineraryDate}
              onChange={(event) => {
                setItineraryDate(event.target.value);
                setSelectedItineraryBranchId(null);
              }}
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {itineraryBranchSummaries.map((summary) => (
            <button
              key={summary.branch.id}
              type="button"
              className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-brand-blue hover:bg-blue-50"
              onClick={() => setSelectedItineraryBranchId(summary.branch.id)}
            >
              <p className="text-xs font-bold uppercase text-brand-green">{summary.branch.branchCode}</p>
              <p className="mt-1 font-bold text-slate-950">{summary.branch.branchName}</p>
              <p className="mt-2 text-sm text-slate-600">{summary.rows.length.toLocaleString("en-US")} approved visit(s)</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <span>
                  Due today
                  <strong className="block text-sm text-red-700">{money(summary.due)}</strong>
                </span>
                <span>
                  Balance
                  <strong className="block text-sm text-slate-950">{money(summary.balance)}</strong>
                </span>
              </div>
            </button>
          ))}
          {!itineraryBranchSummaries.length ? (
            <p className="text-sm text-slate-500">
              {itineraryDate ? "No approved visit itinerary for the selected follow-up date." : "No approved visit itinerary yet."}
            </p>
          ) : null}
          {false && itineraryRows.map(({ loan, visit }) => (
            <div key={visit.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-bold uppercase text-brand-green">{dateOnly(visit.scheduledDate)}</p>
              <p className="mt-1 font-bold text-slate-950">{loan.client.fullName}</p>
              <p className="text-sm text-slate-500">{loan.branch.branchName} · {loan.loanNumber ?? loan.remoteId}</p>
              <p className="mt-2 text-sm text-slate-600">{visit.scheduleNotes || "Approved field visit."}</p>
            </div>
          ))}
          {false ? <p className="text-sm text-slate-500">No approved visit itinerary yet.</p> : null}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-brand-blue" />
            <h3 className="font-bold text-slate-950">My Created Follow-ups</h3>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {myFollowUps.map(({ loan, visit }) => (
              <div key={visit.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-950">{loan.client.fullName}</p>
                    <p className="text-sm text-slate-500">{loan.branch.branchName} - {loan.loanNumber ?? loan.remoteId}</p>
                    <p className="mt-1 text-xs text-slate-500">Follow-up: {dateOnly(visit.scheduledDate)}</p>
                  </div>
                  <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-brand-blue">{statusLabel(visit.status)}</span>
                </div>
                {visit.status === "APPROVED" ? (
                  <form className="mt-3 grid gap-2 rounded-md bg-emerald-50 p-3" onSubmit={(event) => submitVisitReport(event, visit.id)}>
                    <textarea name="visitNotes" className="field min-h-16 text-sm" placeholder="Notes after visiting the client" />
                    <textarea name="negotiationNotes" className="field min-h-16 text-sm" placeholder="Negotiation / agreement with client" />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input name="promisedAmount" className="field h-9 text-sm" type="number" min="0" step="0.01" placeholder="Promise amount" />
                      <input name="paidAmount" className="field h-9 text-sm" type="number" min="0" step="0.01" placeholder="Paid amount" />
                    </div>
                    <input name="nextVisitDate" className="field h-9 text-sm" type="date" />
                    <input name="nextVisitNotes" className="field h-9 text-sm" placeholder="Next visit notes for approval" />
                    <button className="btn-primary h-9 justify-self-start px-3 text-xs" disabled={isPending}>
                      <Send className="h-4 w-4" />
                      Save visit notes
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    {visit.status === "PENDING_APPROVAL" ? "Waiting for Area Team Lead approval before visit notes can be entered." : "Visit report has been completed."}
                  </p>
                )}
              </div>
            ))}
            {!myFollowUps.length ? <p className="text-sm text-slate-500">No follow-up schedules created yet.</p> : null}
          </div>
        </div>
      </section>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm">
          <span className="font-semibold text-slate-700">
            Showing {firstResult}-{lastResult} of {totalLoans} past-due loan(s)
          </span>
          <span className="text-slate-500">Page {safePage} of {totalPages}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1480px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">No.</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Loan</th>
                <th className="px-4 py-3">Maturity</th>
                <th className="px-4 py-3">Past Due Since</th>
                <th className="px-4 py-3">Days Past Due</th>
                <th className="px-4 py-3">Due Today</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Officer / Visit</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan, index) => {
                const approvedVisits = loan.assignment?.visits.filter((visit) => visit.status === "APPROVED") ?? [];
                const assignedToCurrentUser = loan.assignment?.assignedTo.id === currentUserId;
                const currentVisit = latestVisit(loan);

                return (
                  <tr key={loan.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-4 font-semibold text-slate-500">{firstRowNumber + index}</td>
                    <td className="px-4 py-4">
                      <p className="font-bold text-slate-950">{loan.client.fullName}</p>
                      <p className="text-xs text-slate-500">{loan.client.clientId ?? "No client no."} · {loan.client.contactNumber ?? "No contact"}</p>
                      <p className="mt-1 max-w-72 text-xs text-slate-500">{loan.client.address ?? "-"}</p>
                    </td>
                    <td className="px-4 py-4">{loan.branch.branchName}</td>
                    <td className="px-4 py-4">
                      <p className="font-bold text-brand-blue">{loan.loanNumber ?? loan.remoteId}</p>
                      <p className="text-xs text-slate-500">{loan.sourceStatusCode ?? "-"} - {loan.sourceStatusName ?? "Past due"}</p>
                    </td>
                    <td className="px-4 py-4">{dateOnly(loan.maturityAt)}</td>
                    <td className="px-4 py-4 font-semibold text-red-700">{dateOnly(loan.pastDueDate)}</td>
                    <td className="px-4 py-4 font-bold text-red-700">{loan.daysPastDue.toLocaleString("en-US")}</td>
                    <td className="px-4 py-4 font-semibold">{money(loan.due)}</td>
                    <td className="px-4 py-4 text-brand-green">{money(loan.paid)}</td>
                    <td className="px-4 py-4 font-bold text-red-700">{money(loan.balance)}</td>
                    <td className="px-4 py-4">
                      {loan.assignment ? (
                        <div>
                          <p className="font-bold text-slate-950">{loan.assignment.assignedTo.name}</p>
                          <p className="text-xs text-slate-500">{loan.assignment.assignedTo.email}</p>
                          {currentVisit ? (
                            <span className="mt-2 inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-brand-blue">
                              {statusLabel(currentVisit.status)} · {dateOnly(currentVisit.scheduledDate)}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="grid gap-3">
                        {(assignedToCurrentUser || canAssign) && approvedVisits.length ? (
                          <form className="grid min-w-80 gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3" onSubmit={(event) => submitVisitReport(event, approvedVisits[0].id)}>
                            <p className="text-xs font-bold uppercase text-brand-green">Record visit result</p>
                            <p className="text-sm font-semibold text-slate-900">{dateOnly(approvedVisits[0].scheduledDate)}</p>
                            <textarea name="visitNotes" className="field min-h-16 text-sm" placeholder="Visit notes" />
                            <textarea name="negotiationNotes" className="field min-h-16 text-sm" placeholder="Negotiation with client" />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input name="promisedAmount" className="field h-9 text-sm" type="number" min="0" step="0.01" placeholder="Promise amount" />
                              <input name="paidAmount" className="field h-9 text-sm" type="number" min="0" step="0.01" placeholder="Paid amount" />
                            </div>
                            <input name="nextVisitDate" className="field h-9 text-sm" type="date" />
                            <textarea name="nextVisitNotes" className="field min-h-16 text-sm" placeholder="Next visit notes for approval" />
                            <button className="btn-primary h-9 text-xs" disabled={isPending}>
                              <Send className="h-4 w-4" />
                              Submit result
                            </button>
                          </form>
                        ) : null}

                        {!canAssign && !approvedVisits.length ? (
                          <p className="text-sm text-slate-500">Waiting for approved visit schedule.</p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loans.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={12}>No past-due remedial loans found for your access.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link className={`btn-secondary h-9 px-3 ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`} href={previousHref}>
              Previous
            </Link>
            <Link className={`btn-secondary h-9 px-3 ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`} href={nextHref}>
              Next
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            {pageLinks.map(({ page, href, showGap }) => (
              <span key={page} className="flex items-center gap-1">
                {showGap ? <span className="px-2 text-slate-400">...</span> : null}
                <Link
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 font-semibold ${
                    page === safePage ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  href={href}
                >
                  {page}
                </Link>
              </span>
            ))}
          </div>
        </div>
      </div>

      {selectedItinerarySummary ? (
        <div className="fixed inset-0 z-50 bg-slate-950/50 p-4">
          <div className="mx-auto flex max-h-[calc(100vh-2rem)] max-w-7xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl print-area">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Officer Itinerary Detail</p>
                <h3 className="text-xl font-bold text-slate-950">{selectedItinerarySummary.branch.branchName}</h3>
                <p className="text-sm text-slate-500">
                  {itineraryDate ? `Follow-up date ${dateOnly(itineraryDate)}` : "All approved follow-up dates"} |{" "}
                  {selectedItinerarySummary.rows.length.toLocaleString("en-US")} visit(s) | Due today {money(selectedItinerarySummary.due)}
                </p>
              </div>
              <div className="flex items-center gap-2 no-print">
                <PrintReportButton />
                <button type="button" className="btn-secondary h-9 px-3" onClick={() => setSelectedItineraryBranchId(null)}>
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[1320px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">No.</th>
                    <th className="px-4 py-3">Follow-up Date</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Loan</th>
                    <th className="px-4 py-3">Officer</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Due Today</th>
                    <th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3">Instruction / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItinerarySummary.rows.map(({ loan, visit }, index) => (
                    <tr key={visit.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 font-semibold text-slate-500">{index + 1}</td>
                      <td className="px-4 py-3 font-bold text-brand-green">{dateOnly(visit.scheduledDate)}</td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-950">{loan.client.fullName}</p>
                        <p className="text-xs text-slate-500">{loan.client.clientId ?? "-"}</p>
                        <p className="mt-1 max-w-80 text-xs text-slate-500">{loan.client.address ?? "-"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-brand-blue">{loan.loanNumber ?? loan.remoteId}</p>
                        <p className="text-xs text-slate-500">{loan.sourceStatusCode ?? "-"} - {loan.sourceStatusName ?? "Past due"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-950">{loan.assignment?.assignedTo.name ?? "Unassigned"}</p>
                        <p className="text-xs text-slate-500">{loan.assignment?.assignedTo.email ?? "-"}</p>
                      </td>
                      <td className="px-4 py-3">{loan.client.contactNumber ?? "-"}</td>
                      <td className="px-4 py-3 font-bold text-red-700">{money(loan.due)}</td>
                      <td className="px-4 py-3 font-bold text-red-700">{money(loan.balance)}</td>
                      <td className="px-4 py-3">
                        <p className="max-w-96 text-slate-700">{visit.scheduleNotes || "Approved field visit."}</p>
                        {visit.visitNotes ? <p className="mt-2 text-xs text-slate-500">Visit notes: {visit.visitNotes}</p> : null}
                        {visit.negotiationNotes ? <p className="mt-1 text-xs text-slate-500">Negotiation: {visit.negotiationNotes}</p> : null}
                      </td>
                    </tr>
                  ))}
                  {!selectedItinerarySummary.rows.length ? (
                    <tr>
                      <td className="px-4 py-6 text-slate-500" colSpan={9}>
                        No approved visits found for this branch and date filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {canAssign && showAssignmentModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Remedial Assignment</p>
                <h3 className="text-xl font-bold text-slate-950">Assign follow-up to Account Officer</h3>
              </div>
              <button
                type="button"
                className="btn-secondary h-9 px-3"
                onClick={() => {
                  setAssignmentSearch("");
                  setShowAssignmentModal(false);
                }}
              >
                <XCircle className="h-4 w-4" />
                Close
              </button>
            </div>
            <form onSubmit={submitAssignmentModal} className="grid max-h-[calc(90vh-80px)] gap-4 overflow-auto p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_0.7fr_1fr]">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Account Officer</span>
                  <select name="assignedToId" className="field" required>
                    <option value="">Select Account Officer</option>
                    {officers.map((officer) => (
                      <option key={officer.id} value={officer.id}>
                        {officer.name} - {officer.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Follow-up / visit date</span>
                  <input name="scheduledDate" className="field" type="date" required />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Visit instructions</span>
                  <input name="scheduleNotes" className="field" placeholder="Instruction for the assigned officer" />
                </label>
              </div>
              <textarea name="assignmentNotes" className="field min-h-20" placeholder="Assignment notes" />

              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Filter client / loan / address</span>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="search"
                      className="field min-w-64 flex-1 bg-white"
                      placeholder="Search client, loan no., branch, contact, current officer, or address"
                      value={assignmentSearch}
                      onChange={(event) => setAssignmentSearch(event.target.value)}
                    />
                    <button type="button" className="btn-secondary h-11 px-4" onClick={() => setAssignmentSearch("")}>
                      Clear
                    </button>
                  </div>
                </label>
                <p className="mt-2 text-xs text-slate-500">
                  Showing {filteredUnassignedLoans.length.toLocaleString("en-US")} of {unassignedLoans.length.toLocaleString("en-US")} available loan(s).
                </p>
              </div>

              <div className="rounded-lg border border-slate-200">
                <div className="grid grid-cols-[42px_1.8fr_0.8fr_1fr_1fr_0.7fr_1fr] gap-3 bg-slate-50 px-3 py-2 text-xs font-bold uppercase text-slate-500">
                  <span />
                  <span>Client / Loan / Address</span>
                  <span>Branch</span>
                  <span>Balance</span>
                  <span>Past Due Since</span>
                  <span>Days</span>
                  <span>Current Officer</span>
                </div>
                <div className="max-h-96 overflow-auto">
                  {filteredUnassignedLoans.map((loan) => (
                    <label key={loan.id} className="grid cursor-pointer grid-cols-[42px_1.8fr_0.8fr_1fr_1fr_0.7fr_1fr] gap-3 border-t border-slate-100 px-3 py-3 text-sm hover:bg-blue-50">
                      <input name="loanIds" type="checkbox" value={loan.id} className="mt-1 h-4 w-4 rounded border-slate-300" />
                      <span>
                        <span className="block font-bold text-slate-950">{loan.client.fullName}</span>
                        <span className="text-xs text-brand-blue">{loan.loanNumber ?? loan.remoteId}</span>
                        <span className="mt-1 block max-w-xl text-xs text-slate-500">{loan.client.address ?? "No address"}</span>
                      </span>
                      <span>{loan.branch.branchName}</span>
                      <span className="font-bold text-red-700">{money(loan.balance)}</span>
                      <span className="font-semibold text-red-700">{dateOnly(loan.pastDueDate)}</span>
                      <span className="font-bold text-red-700">{loan.daysPastDue.toLocaleString("en-US")}</span>
                      <span>{loan.assignment?.assignedTo.name ?? "Unassigned"}</span>
                    </label>
                  ))}
                  {!filteredUnassignedLoans.length ? (
                    <p className="px-3 py-6 text-sm text-slate-500">
                      {assignmentSearch ? "No available loans match the assignment filter." : "No unassigned past-due loans available for assignment."}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setAssignmentSearch("");
                    setShowAssignmentModal(false);
                  }}
                >
                  Cancel
                </button>
                <button className="btn-primary" disabled={isPending || !filteredUnassignedLoans.length || !officers.length}>
                  <Send className="h-4 w-4" />
                  Assign and submit for approval
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {canCreateOwnSchedule && showScheduleModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Follow-up Schedule</p>
                <h3 className="text-xl font-bold text-slate-950">Select past-due loans to visit</h3>
              </div>
              <button type="button" className="btn-secondary h-9 px-3" onClick={() => setShowScheduleModal(false)}>
                <XCircle className="h-4 w-4" />
                Close
              </button>
            </div>
            <form onSubmit={submitOwnSchedule} className="grid max-h-[calc(90vh-80px)] gap-4 overflow-auto p-5">
              <div className="grid gap-3 md:grid-cols-[0.7fr_1fr]">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Follow-up / visit date</span>
                  <input name="scheduledDate" className="field" type="date" required />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Schedule notes</span>
                  <input name="scheduleNotes" className="field" placeholder="General purpose or instruction for this route" />
                </label>
              </div>

              <div className="rounded-lg border border-slate-200">
                <div className="grid grid-cols-[42px_1.5fr_1fr_1fr_1fr_0.8fr_1fr] gap-3 bg-slate-50 px-3 py-2 text-xs font-bold uppercase text-slate-500">
                  <span />
                  <span>Client / Loan</span>
                  <span>Branch</span>
                  <span>Balance</span>
                  <span>Past Due Since</span>
                  <span>Days</span>
                  <span>Maturity</span>
                </div>
                <div className="max-h-96 overflow-auto">
                {assignedLoans.map((loan) => (
                    <label key={loan.id} className="grid cursor-pointer grid-cols-[42px_1.5fr_1fr_1fr_1fr_0.8fr_1fr] gap-3 border-t border-slate-100 px-3 py-3 text-sm hover:bg-blue-50">
                      <input name="loanIds" type="checkbox" value={loan.id} className="mt-1 h-4 w-4 rounded border-slate-300" />
                      <span>
                        <span className="block font-bold text-slate-950">{loan.client.fullName}</span>
                        <span className="text-xs text-brand-blue">{loan.loanNumber ?? loan.remoteId}</span>
                      </span>
                      <span>{loan.branch.branchName}</span>
                      <span className="font-bold text-red-700">{money(loan.balance)}</span>
                      <span className="font-semibold text-red-700">{dateOnly(loan.pastDueDate)}</span>
                      <span className="font-bold text-red-700">{loan.daysPastDue.toLocaleString("en-US")}</span>
                      <span>{dateOnly(loan.maturityAt)}</span>
                    </label>
                  ))}
                  {!assignedLoans.length ? <p className="px-3 py-6 text-sm text-slate-500">No assigned past-due loans available for scheduling.</p> : null}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" className="btn-secondary" onClick={() => setShowScheduleModal(false)}>
                  Cancel
                </button>
                <button className="btn-primary" disabled={isPending || !assignedLoans.length}>
                  <Send className="h-4 w-4" />
                  Submit for approval
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {canApprove && showApprovalModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Area Team Lead Approval</p>
                <h3 className="text-xl font-bold text-slate-950">Approve follow-up schedules</h3>
              </div>
              <button type="button" className="btn-secondary h-9 px-3" onClick={() => setShowApprovalModal(false)}>
                <XCircle className="h-4 w-4" />
                Close
              </button>
            </div>
            <div className="max-h-[calc(90vh-80px)] overflow-auto p-5">
              <div className="grid gap-3">
                {pendingApprovalSchedules.map(({ loan, visit }) => (
                  <div key={visit.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr_0.8fr_auto]">
                      <div>
                        <p className="font-bold text-slate-950">{loan.client.fullName}</p>
                        <p className="text-sm text-slate-500">{loan.branch.branchName} - {loan.loanNumber ?? loan.remoteId}</p>
                        <p className="mt-2 text-sm text-slate-600">{visit.scheduleNotes || "No schedule notes entered."}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-500">Schedule date</p>
                        <p className="mt-1 font-bold text-slate-950">{dateOnly(visit.scheduledDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-500">Past due</p>
                        <p className="mt-1 font-bold text-red-700">{loan.daysPastDue.toLocaleString("en-US")} day(s)</p>
                        <p className="text-xs text-slate-500">Since {dateOnly(loan.pastDueDate)}</p>
                      </div>
                      <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                        <button type="button" className="btn-primary h-9 px-3 text-xs" onClick={() => updateVisit(visit.id, "approve")}>
                          <CheckCircle2 className="h-4 w-4" />
                          Approve
                        </button>
                        <button type="button" className="btn-secondary h-9 px-3 text-xs" onClick={() => updateVisit(visit.id, "reject")}>
                          <XCircle className="h-4 w-4" />
                          Disapprove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!pendingApprovalSchedules.length ? (
                  <p className="rounded-lg border border-slate-200 p-5 text-sm text-slate-500">
                    No follow-up schedules are pending approval.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
