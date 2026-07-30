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
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-blue-100" role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
      <div
        className="h-full bg-brand-blue shadow-[0_0_10px_rgba(37,99,235,0.8)] transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
