"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Long enough that an instant page change never flashes the bar, short enough that a slow
// one shows progress straight away. The old 45s wait existed only to keep a full-screen
// dimmer off the screen; a 3px bar costs nothing, so it no longer has to hide that long.
const SHOW_AFTER_MS = 250;

export function AppProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [progress, setProgress] = useState(0);
  const navigationPending = useRef(false);
  const visible = useRef(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function reveal() {
      visible.current = true;
      setProgress((current) => (current > 0 ? current : 10));
      fallbackTimer.current = setTimeout(() => setProgress((current) => (current > 0 ? 85 : 0)), 900);
    }

    // A left-menu navigation started. Nothing becomes visible yet - the bar is
    // only revealed if the navigation is still pending after SHOW_AFTER_MS, so
    // fast page changes show nothing at all.
    function markBusy() {
      if (visible.current || showTimer.current) return;
      showTimer.current = setTimeout(() => {
        showTimer.current = null;
        if (navigationPending.current) reveal();
      }, SHOW_AFTER_MS);
    }

    // Only left-menu navigation triggers the bar. Buttons, form
    // submissions, and in-page fetches (search, save, etc.) never do - they
    // must stay interactive even while a request is in flight.
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (
        link &&
        link.closest("[data-primary-nav]") &&
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
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  useEffect(() => {
    // Route changes are the completion signal for primary-menu navigation.
    // Always cancel the pending reveal, even when the reveal delay meant
    // the bar never became visible. Otherwise that old timer can fire
    // later while the user is clicking buttons inside the destination page.
    navigationPending.current = false;
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }

    if (progress > 0) {
      visible.current = false;
      setProgress(100);
      const timer = setTimeout(() => setProgress(0), 350);
      return () => clearTimeout(timer);
    }
  // A completed App Router navigation changes the pathname or query string.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, queryString]);

  if (progress === 0) return null;

  // A slim bar across the top of the viewport. It never covers the page, never dims it, and
  // is pointer-events-none, so everything underneath stays readable and clickable while a
  // navigation is in flight.
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]">
      <div
        role="progressbar"
        aria-label="Loading page"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 shadow-[0_0_10px_rgba(37,99,235,0.7)] transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
