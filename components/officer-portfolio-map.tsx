"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, MapPin, Search, TriangleAlert } from "lucide-react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";

export type OfficerMapLocation = { id: number; province: string; municipality: string; barangay: string; loans: number };
type MappedLocation = OfficerMapLocation & { latitude: number | null; longitude: number | null; precision: "BARANGAY" | "MUNICIPALITY" | "UNMAPPED" };
type MapClient = { id: number; name: string; clientNumber: string | null; loans: number; balance: number };
const label = (location: OfficerMapLocation) => `${location.barangay}, ${location.municipality}, ${location.province}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
const peso = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "PHP" });

export function OfficerPortfolioMap({ officerId, officerName, locations }: { officerId: number; officerName: string; locations: OfficerMapLocation[] }) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef(new Map<number, CircleMarker>());
  const clientsCacheRef = useRef(new Map<number, MapClient[]>());
  const [query, setQuery] = useState("");
  const [mapped, setMapped] = useState<MappedLocation[]>([]);
  const [loading, setLoading] = useState(Boolean(locations.length));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locations.length) { setLoading(false); return; }
    const controller = new AbortController();
    fetch("/api/location-masterlist/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locations }), signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error ?? "Unable to map the assigned barangays."); return data; })
      .then((data) => { const byId = new Map<number, MappedLocation>((data.locations as MappedLocation[]).map((item) => [item.id, item])); setMapped(locations.map((item) => byId.get(item.id) ?? { ...item, latitude: null, longitude: null, precision: "UNMAPPED" })); })
      .catch((requestError) => { if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setError(requestError instanceof Error ? requestError.message : "Unable to map the assigned barangays."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [locations]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current || loading) return;
    let disposed = false;
    const markers = markersRef.current;
    void import("leaflet").then((L) => {
      if (disposed || !mapElementRef.current) return;
      const map = L.map(mapElementRef.current).setView([8.93, 125.54], 9);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      const bounds: [number, number][] = [];
      async function showClients(location: MappedLocation, marker: CircleMarker) {
        marker.setPopupContent(`<strong>${escapeHtml(location.barangay)}</strong><br>${escapeHtml(location.municipality)}, ${escapeHtml(location.province)}<br><strong>${location.loans.toLocaleString("en-US")}</strong> outstanding loan(s)<hr style="margin:6px 0"><small>Loading clients...</small>`).openPopup();
        try {
          let clients = clientsCacheRef.current.get(location.id);
          if (!clients) {
            const response = await fetch(`/api/location-masterlist/officer-map-clients?officerId=${officerId}&locationId=${location.id}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error ?? "Unable to load clients.");
            clients = data.clients as MapClient[];
            clientsCacheRef.current.set(location.id, clients);
          }
          const rows = clients.map((client) => `<li style="padding:5px 0;border-top:1px solid #e2e8f0"><strong>${escapeHtml(client.name)}</strong>${client.clientNumber ? `<br><small>${escapeHtml(client.clientNumber)}</small>` : ""}<br><small>${client.loans} loan(s) · ${escapeHtml(peso(client.balance))}</small></li>`).join("");
          marker.setPopupContent(`<strong>${escapeHtml(location.barangay)}</strong><br>${escapeHtml(location.municipality)}, ${escapeHtml(location.province)}<br><strong>${clients.length.toLocaleString("en-US")}</strong> client(s) · ${location.loans.toLocaleString("en-US")} loan(s)<ul style="list-style:none;margin:6px 0 0;padding:0;max-height:260px;overflow:auto">${rows || "<li>No clients found.</li>"}</ul>`);
        } catch (loadError) {
          marker.setPopupContent(`<strong>${escapeHtml(location.barangay)}</strong><br><span style="color:#b91c1c">${escapeHtml(loadError instanceof Error ? loadError.message : "Unable to load clients.")}</span>`);
        }
      }
      for (const location of mapped) {
        if (location.latitude === null || location.longitude === null) continue;
        const point: [number, number] = [location.latitude, location.longitude]; bounds.push(point);
        const marker = L.circleMarker(point, { radius: Math.min(18, 6 + Math.sqrt(location.loans) * 1.6), color: "#0b2d73", weight: 2, fillColor: location.precision === "BARANGAY" ? "#f4c430" : "#60a5fa", fillOpacity: 0.85 })
          .bindPopup(`<strong>${escapeHtml(location.barangay)}</strong><br>${escapeHtml(location.municipality)}, ${escapeHtml(location.province)}<br><small>Hover or click to load clients</small>`, { maxWidth: 380 }).addTo(map);
        marker.on("mouseover click", () => { void showClients(location, marker); });
        markers.set(location.id, marker);
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      mapRef.current = map;
    });
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; markers.clear(); };
  }, [loading, mapped, officerId]);

  const displayed: MappedLocation[] = mapped.length ? mapped : locations.map((item) => ({ ...item, latitude: null, longitude: null, precision: "UNMAPPED" }));
  const filtered = useMemo(() => { const terms = query.trim().toLocaleLowerCase("en").split(/\s+/).filter(Boolean); return terms.length ? displayed.filter((item) => terms.every((term) => label(item).toLocaleLowerCase("en").includes(term))) : displayed; }, [displayed, query]);
  const pinnedCount = mapped.filter((item) => item.latitude !== null && item.longitude !== null).length;
  function focusPin(location: MappedLocation) { const marker = markersRef.current.get(location.id); if (marker && mapRef.current) { mapRef.current.setView(marker.getLatLng(), 15, { animate: true }); marker.openPopup(); } }

  return <div className="grid h-[calc(100dvh-13rem)] min-h-[420px] grid-rows-[minmax(150px,35%)_minmax(250px,65%)] gap-3 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-1">
    <aside className="panel flex min-h-0 flex-col overflow-hidden"><div className="shrink-0 border-b border-slate-200 p-3"><label className="relative block"><span className="sr-only">Search assigned barangays</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="field pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search barangay or municipality" /></label><p className="mt-2 text-[11px] font-semibold text-slate-500">{loading ? "Resolving barangay pins..." : `${pinnedCount} of ${locations.length} barangay location(s) pinned`}</p></div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">{filtered.map((location) => { const pinned = location.latitude !== null && location.longitude !== null; return <button key={location.id} type="button" disabled={!pinned} className="mb-1 flex w-full items-start gap-2 rounded-md border border-transparent px-3 py-2 text-left transition enabled:hover:border-blue-100 enabled:hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => focusPin(location)}><MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${pinned ? "text-amber-600" : "text-slate-400"}`} /><span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{location.barangay}</span><span className="block text-xs text-slate-500">{location.municipality}, {location.province}</span>{location.precision === "MUNICIPALITY" ? <span className="block text-[10px] font-semibold text-blue-600">Approximate municipality pin</span> : location.precision === "UNMAPPED" && !loading ? <span className="block text-[10px] font-semibold text-amber-700">Pin unavailable</span> : null}</span><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-brand-blue shadow-sm">{location.loans}</span></button>; })}</div>
    </aside>
    <section className="panel relative min-h-0 overflow-hidden overscroll-contain" aria-label={`${officerName} barangay location map`}><div ref={mapElementRef} className="h-full min-h-0 w-full" />{loading ? <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/80"><p className="flex items-center gap-2 font-bold text-brand-blue"><LoaderCircle className="h-5 w-5 animate-spin" />Mapping officer barangays...</p></div> : null}{error ? <div className="absolute inset-x-4 top-4 z-[500] rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 shadow"><TriangleAlert className="mr-2 inline h-4 w-4" />{error}</div> : null}</section>
  </div>;
}
