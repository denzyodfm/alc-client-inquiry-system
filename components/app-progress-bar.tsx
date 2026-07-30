"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function AppProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const pendingRequests = useRef(0);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearTimers() {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    }

    function start() {
      clearTimers();
      setProgress((current) => current > 0 ? current : 10);
      fallbackTimer.current = setTimeout(() => setProgress((current) => current > 0 ? 85 : 0), 900);
      hideTimer.current = setTimeout(() => setProgress(0), 30000);
    }

    function finish() {
      clearTimers();
      setProgress(100);
      hideTimer.current = setTimeout(() => setProgress(0), 350);
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (link && !link.target && link.origin === window.location.origin && link.href !== window.location.href) {
        start();
        return;
      }

    }

    function handleSubmit() {
      start();
    }

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      pendingRequests.current += 1;
      start();
      try {
        return await originalFetch(...args);
      } finally {
        pendingRequests.current -= 1;
        if (pendingRequests.current === 0) finish();
      }
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    return () => {
      clearTimers();
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (progress > 0) {
      setProgress(100);
      const timer = setTimeout(() => setProgress(0), 350);
      return () => clearTimeout(timer);
    }
  // A completed App Router navigation changes the pathname.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
