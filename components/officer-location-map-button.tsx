"use client";

import Link from "next/link";
import { MapPinned } from "lucide-react";

export function OfficerLocationMapButton({ officerId, officerName }: { officerId: number; officerName: string }) {
  return (
    <Link
      href={`/location-map/${officerId}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${officerName}'s location map`}
      className="ml-2 inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 hover:bg-amber-50"
      onClick={(event) => event.stopPropagation()}
    >
      <MapPinned className="h-3 w-3" />
      Location Map
    </Link>
  );
}
