"use client";

import { CheckCircle2, FileDown, FileSpreadsheet, Printer, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";

type Privilege = { id: number; name: string; permissions: Array<{ functionKey: string }> };
type AppFunction = { key: string; label: string; description: string };

export function AccessControlMatrix({ privileges, functions }: { privileges: Privilege[]; functions: AppFunction[] }) {
  const initial = privileges.flatMap((privilege) => privilege.permissions.map((permission) => `${privilege.id}:${permission.functionKey}`));
  const [checked, setChecked] = useState(() => new Set(initial));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const asOf = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date());

  function reportRows() {
    return functions.map((item) => [item.label, ...privileges.map((privilege) => checked.has(`${privilege.id}:${item.key}`) ? "ON" : "OFF")]);
  }

  function escapeHtml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function printMatrix() {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    const header = ["App Functionality", ...privileges.map((item) => item.name)];
    popup.document.write(`<!doctype html><html><head><title>Privilege Access Matrix</title><style>body{font:12px Arial;padding:24px;color:#0f172a}h1{margin:0}p{margin:6px 0 18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:7px;text-align:center}th:first-child,td:first-child{text-align:left}th{background:#eff6ff}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><h1>Privilege Access Matrix</h1><p>As of ${escapeHtml(asOf)} · Admin always has full access</p><table><thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${reportRows().map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  function downloadExcel() {
    const rows = [["Privilege Access Matrix"], [`As of ${asOf}`], [], ["App Functionality", ...privileges.map((item) => item.name)], ...reportRows()];
    const table = `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
    download(new Blob([`<html><head><meta charset="utf-8"></head><body>${table}</body></html>`], { type: "application/vnd.ms-excel" }), "privilege-access-matrix.xls");
  }

  function downloadPdf() {
    const lines = [`Privilege Access Matrix`, `As of ${asOf}`, `Admin always has full access`, "", ...reportRows().map((row) => `${row[0]} | ${privileges.map((item, index) => `${item.name}: ${row[index + 1]}`).join(" | ")}`.slice(0, 105))];
    const pages: string[][] = [];
    for (let index = 0; index < lines.length; index += 36) pages.push(lines.slice(index, index + 36));
    const objects: string[] = ["", "<< /Type /Catalog /Pages 2 0 R >>", ""];
    const pageIds: number[] = []; const streamIds: number[] = [];
    for (const pageLines of pages) {
      const pageId = objects.length; pageIds.push(pageId); objects.push("");
      const streamId = objects.length; streamIds.push(streamId);
      const text = pageLines.map((line, index) => `BT /F1 9 Tf 36 ${756 - index * 20} Td (${line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")}) Tj ET`).join("\n");
      objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    }
    const fontId = objects.length; objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    pageIds.forEach((pageId, index) => { objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamIds[index]} 0 R >>`; });
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    let pdf = "%PDF-1.4\n"; const offsets = [0];
    for (let id = 1; id < objects.length; id++) { offsets[id] = pdf.length; pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`; }
    const xref = pdf.length; pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    download(new Blob([pdf], { type: "application/pdf" }), "privilege-access-matrix.pdf");
  }

  function toggle(key: string) {
    setChecked((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
    setNotice(null);
  }

  async function save() {
    setLoading(true); setError(null); setNotice(null);
    try {
      const matrix = privileges.map((privilege) => ({
        privilegeTemplateId: privilege.id,
        functionKeys: functions.filter((item) => checked.has(`${privilege.id}:${item.key}`)).map((item) => item.key)
      }));
      const response = await fetch("/api/privileges/matrix", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matrix }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to save access matrix.");
      setNotice("Access matrix saved. Changes now apply to every user assigned to these privileges.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save access matrix."); }
    finally { setLoading(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-950">Privilege Access Matrix</h3><p className="mt-1 text-xs text-slate-600">Rows are app functions. Switches grant or remove privilege access. As of {asOf}.</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={printMatrix}><Printer className="h-3.5 w-3.5" />Print</button><button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={downloadExcel}><FileSpreadsheet className="h-3.5 w-3.5" />Excel</button><button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={downloadPdf}><FileDown className="h-3.5 w-3.5" />PDF</button><div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-brand-green"><ShieldCheck className="h-3.5 w-3.5" />Admin always has full access</div></div></div>
    {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
    {notice ? <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green"><CheckCircle2 className="h-4 w-4" />{notice}</div> : null}
    <div className="panel max-h-[calc(100vh-33rem)] min-h-64 overflow-auto overscroll-contain">
      {privileges.length ? <table className="w-full min-w-max border-collapse text-sm"><thead className="sticky top-0 z-30"><tr className="bg-slate-50"><th className="sticky left-0 z-40 min-w-72 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-600">App Functionality</th>{privileges.map((privilege) => <th key={privilege.id} className="min-w-40 border-b border-slate-200 bg-slate-50 px-4 py-3 text-center text-slate-900">{privilege.name}</th>)}</tr></thead><tbody>{functions.map((item) => <tr key={item.key} className="border-b border-slate-100 last:border-0"><td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3"><span className="block font-bold text-slate-900">{item.label}</span><span className="block text-xs text-slate-500">{item.description}</span></td>{privileges.map((privilege) => { const key = `${privilege.id}:${item.key}`; const enabled = checked.has(key); return <td key={privilege.id} className="px-4 py-3 text-center"><button type="button" role="switch" aria-checked={enabled} onClick={() => toggle(key)} aria-label={`${privilege.name}: ${item.label}`} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${enabled ? "bg-brand-blue" : "bg-slate-300"}`}><span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} /><span className="sr-only">{enabled ? "On" : "Off"}</span></button></td>; })}</tr>)}</tbody></table> : <p className="p-5 text-sm text-slate-500">Create at least one privilege before configuring the access matrix.</p>}
    </div>
    {privileges.length ? <div className="flex justify-end"><button type="button" className="btn-primary" onClick={save} disabled={loading}><Save className="h-4 w-4" />{loading ? "Saving..." : "Save Access Matrix"}</button></div> : null}
  </div>;
}
