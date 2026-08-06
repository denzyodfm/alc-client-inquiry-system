"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SHOW_AFTER_MS = 45000;

export function AppProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [progress, setProgress] = useState(0);
  const pendingRequests = useRef(0);
  const navigationPending = useRef(false);
  const visible = useRef(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleFinishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function isBusy() {
      return pendingRequests.current > 0 || navigationPending.current;
    }

    function reveal() {
      visible.current = true;
      setProgress((current) => (current > 0 ? current : 10));
      fallbackTimer.current = setTimeout(() => setProgress((current) => (current > 0 ? 85 : 0)), 900);
    }

    // An operation started (click/submit/fetch). Nothing becomes visible yet -
    // we only reveal the overlay if the operation is still running after
    // SHOW_AFTER_MS, so fast interactions (the overwhelming majority) never
    // dim the screen or show a progress bar at all.
    function markBusy() {
      if (visible.current || showTimer.current) return;
      showTimer.current = setTimeout(() => {
        showTimer.current = null;
        if (isBusy()) reveal();
      }, SHOW_AFTER_MS);
    }

    // An operation finished. If the overlay was never revealed (finished
    // within the 45s grace period), just cancel the pending reveal - no
    // visual ever appears. If it was already revealed, run the normal
    // finish animation.
    function markIdle() {
      if (isBusy()) return;
      if (visible.current) {
        finish();
      } else if (showTimer.current) {
        clearTimeout(showTimer.current);
        showTimer.current = null;
      }
    }

    function finish() {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      visible.current = false;
      navigationPending.current = false;
      setProgress(100);
      hideTimer.current = setTimeout(() => setProgress(0), 350);
    }

    function finishWhenIdle() {
      if (idleFinishTimer.current) clearTimeout(idleFinishTimer.current);
      idleFinishTimer.current = setTimeout(() => {
        if (!isBusy()) markIdle();
      }, 900);
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (
        link &&
        link.origin === window.location.origin &&
        link.href !== window.location.href &&
        (link.pathname !== window.location.pathname || link.search !== window.location.search) &&
        link.target !== "_blank" &&
        !link.hasAttribute("download") &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        navigationPending.current = true;
        markBusy();
        return;
      }

      const button = target.closest<HTMLButtonElement>("button");
      if (button && !button.disabled) {
        markBusy();
        finishWhenIdle();
      }
    }

    function handleSubmit() {
      markBusy();
      finishWhenIdle();
    }

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      pendingRequests.current += 1;
      markBusy();
      try {
        return await originalFetch(...args);
      } finally {
        pendingRequests.current -= 1;
        markIdle();
      }
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (idleFinishTimer.current) clearTimeout(idleFinishTimer.current);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (progress > 0) {
      navigationPending.current = false;
      visible.current = false;
      setProgress(100);
      const timer = setTimeout(() => setProgress(0), 350);
      return () => clearTimeout(timer);
    }
  // A completed App Router navigation changes the pathname or query string.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, queryString]);

  if (progress === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/20 px-4 backdrop-blur-[2px]">
      <div
        className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
        role="progressbar"
        aria-label="Processing"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="flex items-center gap-4">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50">
            <span className="absolute inset-1 animate-spin rounded-full border-[3px] border-blue-100 border-t-brand-blue" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-blue shadow-[0_0_12px_rgba(37,99,235,0.8)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-end justify-between gap-3">
              <span>
                <span className="block text-xs font-bold uppercase tracking-[0.16em] text-brand-green">Please wait</span>
                <span className="mt-1 block text-lg font-bold text-slate-950">Processing your request…</span>
              </span>
              <span className="text-lg font-extrabold tabular-nums text-brand-blue">{progress}%</span>
            </span>
            <span className="mt-4 block h-2.5 overflow-hidden rounded-full bg-slate-100 shadow-inner">
              <span
                className="relative block h-full overflow-hidden rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 shadow-[0_0_14px_rgba(37,99,235,0.45)] transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              >
                <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              </span>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
