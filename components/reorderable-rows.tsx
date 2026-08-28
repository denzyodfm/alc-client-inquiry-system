"use client";

import { GripVertical, RotateCcw } from "lucide-react";
import { Children, useEffect, useMemo, useState, type ReactNode } from "react";

// Every list on the page asks for its saved order as it mounts. They are collected for one
// tick and fetched together, so a pivot with dozens of lists still makes a single request.
const pendingKeys = new Map<string, Array<(value: string | null) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function loadSavedOrder(key: string, signal: AbortSignal) {
  return new Promise<string | null>((resolve) => {
    const waiting = pendingKeys.get(key) ?? [];
    waiting.push(resolve);
    pendingKeys.set(key, waiting);
    signal.addEventListener("abort", () => resolve(null), { once: true });
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const keys = Array.from(pendingKeys.keys());
      const waiters = new Map(pendingKeys);
      pendingKeys.clear();
      fetch(`/api/preferences?keys=${encodeURIComponent(keys.join(","))}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          for (const [pendingKey, resolvers] of waiters) {
            const value = data?.values?.[pendingKey] ?? null;
            for (const resolve of resolvers) resolve(value);
          }
        })
        .catch(() => {
          for (const resolvers of waiters.values()) for (const resolve of resolvers) resolve(null);
        });
    }, 25);
  });
}

// Lets a server-rendered list be rearranged by dragging. The children arrive already
// rendered; this only decides the order they appear in. The arrangement is stored against
// the signed-in account, so it follows the user between browsers and is never visible to
// anyone else.
export function ReorderableRows({
  ids,
  storageKey,
  defaultOrderLabel = "default order",
  variant = "full",
  children
}: {
  ids: string[];
  storageKey: string;
  defaultOrderLabel?: string;
  // "nav" drops the table chrome: no header bar, no row borders, for the sidebar menu.
  variant?: "full" | "compact" | "nav";
  children: ReactNode;
}) {
  const nodes = useMemo(() => Children.toArray(children), [children]);
  const [order, setOrder] = useState<string[]>(ids);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void loadSavedOrder(storageKey, controller.signal).then((value) => {
      if (!value || controller.signal.aborted) return;
      try {
        const parsed: string[] = JSON.parse(value);
        // Rows added or removed since the arrangement was saved are reconciled against the
        // current list rather than dropped.
        const kept = parsed.filter((id) => ids.includes(id));
        if (!kept.length) return;
        setOrder([...kept, ...ids.filter((id) => !kept.includes(id))]);
        setCustom(true);
      } catch {
        // A stored value that is no longer valid JSON simply leaves the default order.
      }
    });
    return () => controller.abort();
  }, [ids, storageKey]);

  function persist(next: string[] | null) {
    setSaving(true);
    void fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: storageKey, value: next ? JSON.stringify(next) : null })
    }).finally(() => setSaving(false));
  }

  function move(fromId: string, toId: string) {
    if (fromId === toId) return;
    setOrder((current) => {
      const next = [...current];
      const from = next.indexOf(fromId);
      const to = next.indexOf(toId);
      if (from < 0 || to < 0) return current;
      next.splice(to, 0, ...next.splice(from, 1));
      persist(next);
      return next;
    });
    setCustom(true);
  }

  function reset() {
    persist(null);
    setOrder(ids);
    setCustom(false);
  }

  const nodeById = new Map(ids.map((id, index) => [id, nodes[index]]));

  return (
    <>
      {variant === "nav" ? (
        custom ? (
          <button
            type="button"
            className="mb-1 flex w-full items-center gap-1 px-3 text-[10px] font-semibold text-slate-400 hover:text-brand-blue"
            onClick={reset}
            disabled={saving}
          >
            <RotateCcw className="h-3 w-3" />Reset {defaultOrderLabel}
          </button>
        ) : null
      ) : (
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 text-slate-500 ${
        variant === "full" ? "py-1.5 text-xs" : "py-1 text-[10px]"
      }`}>
        <span className="inline-flex items-center gap-1">
          <GripVertical className={variant === "full" ? "h-3.5 w-3.5" : "h-3 w-3"} />
          {variant === "full"
            ? "Drag a row to arrange it your way. Your arrangement is saved to your account only."
            : "Drag to arrange"}
        </span>
        {custom ? (
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-brand-blue hover:underline" onClick={reset} disabled={saving}>
            <RotateCcw className={variant === "full" ? "h-3.5 w-3.5" : "h-3 w-3"} />Reset to {defaultOrderLabel}
          </button>
        ) : variant === "full" ? <span>Currently in {defaultOrderLabel}.</span> : null}
      </div>
      )}
      {order.map((id) => (
        <div
          key={id}
          draggable
          // Each level stops the event here. Without this a barangay drag would bubble to the
          // city and province rows above it and reorder those lists too, which is also what
          // keeps a row inside the parent it belongs to.
          onDragStart={(event) => { event.stopPropagation(); setDragging(id); event.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={(event) => { event.stopPropagation(); setDragging(null); setDropTarget(null); }}
          onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; if (dropTarget !== id) setDropTarget(id); }}
          onDragLeave={(event) => { event.stopPropagation(); if (dropTarget === id) setDropTarget(null); }}
          onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (dragging) move(dragging, id); setDragging(null); setDropTarget(null); }}
          className={`relative ${variant === "nav" ? "rounded-md" : "border-b border-slate-200 last:border-b-0"} ${dragging === id ? "opacity-50" : ""} ${
            dropTarget === id && dragging !== id ? "outline outline-2 -outline-offset-2 outline-brand-blue" : ""
          }`}
        >
          {nodeById.get(id)}
        </div>
      ))}
    </>
  );
}
