"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, MapPin, Pencil, RotateCcw, Save, Search, TriangleAlert, X } from "lucide-react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";

export type OfficerMapLocation = { id: number; province: string; municipality: string; barangay: string; loans: number; latitude: number | null; longitude: number | null; precision: "BARANGAY" | "MUNICIPALITY" | "MANUAL" | "UNMAPPED"; coordinateSource: string | null; geocodedAt: string | null; geocodeError: string | null; retryAfter: string | null };
type MappedLocation = OfficerMapLocation;
type MapClient = { id: number; name: string; clientNumber: string | null; loans: number; balance: number };
const label = (location: OfficerMapLocation) => `${location.barangay}, ${location.municipality}, ${location.province}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
const peso = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "PHP" });

export function OfficerPortfolioMap({ officerId, officerName, locations, isAdmin }: { officerId: number; officerName: string; locations: OfficerMapLocation[]; isAdmin: boolean }) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef(new Map<number, CircleMarker>());
  const clientsCacheRef = useRef(new Map<number, MapClient[]>());
  const [query, setQuery] = useState("");
  const [mapped, setMapped] = useState<MappedLocation[]>(locations);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MappedLocation | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [saving, setSaving] = useState(false);
  const editingRef = useRef<MappedLocation | null>(null);

  useEffect(() => { editingRef.current = editing; }, [editing]);

  useEffect(() => {
    setMapped(locations);
    if (!locations.length) return;
    const controller = new AbortController();
    async function refresh() {
      for (let attempt = 0; attempt < 5 && !controller.signal.aborted; attempt += 1) {
        const response = await fetch("/api/location-masterlist/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationIds: locations.map(({ id }) => id) }), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to refresh stored pins.");
        const byId = new Map<number, Partial<MappedLocation>>((data.locations as Partial<MappedLocation>[]).map((item) => [item.id!, item]));
        setMapped((current) => current.map((item) => ({ ...item, ...(byId.get(item.id) ?? {}) })));
        if (!data.queued && !data.processing) break;
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
    void refresh().catch((requestError) => { if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setError(requestError instanceof Error ? requestError.message : "Unable to refresh stored pins."); });
    return () => controller.abort();
  }, [locations]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let disposed = false;
    const markers = markersRef.current;
    void import("leaflet").then((L) => {
      if (disposed || !mapElementRef.current) return;
      const map = L.map(mapElementRef.current).setView([8.93, 125.54], 9);
      map.on("click", (event) => {
        if (!editingRef.current) return;
        setLatitude(event.latlng.lat.toFixed(7));
        setLongitude(event.latlng.lng.toFixed(7));
      });
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
        const marker = L.circleMarker(point, { radius: Math.min(18, 6 + Math.sqrt(location.loans) * 1.6), color: "#0b2d73", weight: 2, fillColor: location.precision === "MANUAL" ? "#10b981" : location.precision === "BARANGAY" ? "#f4c430" : "#60a5fa", fillOpacity: 0.85 })
          .bindPopup(`<strong>${escapeHtml(location.barangay)}</strong><br>${escapeHtml(location.municipality)}, ${escapeHtml(location.province)}<br><small>Hover or click to load clients</small>`, { maxWidth: 380 }).addTo(map);
        marker.on("mouseover click", () => { void showClients(location, marker); });
        markers.set(location.id, marker);
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      mapRef.current = map;
    });
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; markers.clear(); };
  }, [mapped, officerId]);

  const displayed: MappedLocation[] = mapped;
  const filtered = useMemo(() => { const terms = query.trim().toLocaleLowerCase("en").split(/\s+/).filter(Boolean); return terms.length ? displayed.filter((item) => terms.every((term) => label(item).toLocaleLowerCase("en").includes(term))) : displayed; }, [displayed, query]);
  const pinnedCount = mapped.filter((item) => item.latitude !== null && item.longitude !== null).length;
  function focusPin(location: MappedLocation) { const marker = markersRef.current.get(location.id); if (marker && mapRef.current) { mapRef.current.setView(marker.getLatLng(), 15, { animate: true }); marker.openPopup(); } }
  function beginEdit(location: MappedLocation) { setEditing(location); setLatitude(location.latitude?.toFixed(7) ?? ""); setLongitude(location.longitude?.toFixed(7) ?? ""); if (location.latitude !== null && location.longitude !== null) mapRef.current?.setView([location.latitude, location.longitude], 15); }
  async function savePin() {
    if (!editing) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/location-masterlist/pins/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude, longitude }) });
      const data = await response.json(); if (!response.ok) throw new Error(data?.error ?? "Unable to save the pin.");
      setMapped((current) => current.map((item) => item.id === editing.id ? { ...item, ...data.location } : item)); setEditing(null);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save the pin."); }
    finally { setSaving(false); }
  }
  async function resetPin() {
    if (!editing) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/location-masterlist/pins/${editing.id}`, { method: "DELETE" });
      const data = await response.json(); if (!response.ok) throw new Error(data?.error ?? "Unable to reset the pin.");
      setMapped((current) => current.map((item) => item.id === editing.id ? { ...item, latitude: null, longitude: null, precision: "UNMAPPED", coordinateSource: null, geocodedAt: null, geocodeError: null, retryAfter: null } : item)); setEditing(null);
      void fetch("/api/location-masterlist/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationIds: [editing.id] }) });
    } catch (resetError) { setError(resetError instanceof Error ? resetError.message : "Unable to reset the pin."); }
    finally { setSaving(false); }
  }

  return <div className="grid h-[calc(100dvh-13rem)] min-h-[420px] grid-rows-[minmax(150px,35%)_minmax(250px,65%)] gap-3 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-1">
    <aside className="panel flex min-h-0 flex-col overflow-hidden"><div className="shrink-0 border-b border-slate-200 p-3"><label className="relative block"><span className="sr-only">Search assigned barangays</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="field pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search barangay or municipality" /></label><p className="mt-2 text-[11px] font-semibold text-slate-500">{loading ? "Resolving barangay pins..." : `${pinnedCount} of ${locations.length} barangay location(s) pinned`}</p></div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">{filtered.map((location) => { const pinned = location.latitude !== null && location.longitude !== null; const editable = isAdmin && (location.precision === "MUNICIPALITY" || location.precision === "UNMAPPED" || location.precision === "MANUAL"); return <div key={location.id} className="mb-1 flex items-start rounded-md border border-transparent transition hover:border-blue-100 hover:bg-blue-50"><button type="button" disabled={!pinned} className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60" onClick={() => focusPin(location)}><MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${location.precision === "MANUAL" ? "text-emerald-600" : pinned ? "text-amber-600" : "text-slate-400"}`} /><span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{location.barangay}</span><span className="block text-xs text-slate-500">{location.municipality}, {location.province}</span>{location.precision === "MANUAL" ? <span className="block text-[10px] font-semibold text-emerald-700">Administrator-corrected pin</span> : location.precision === "MUNICIPALITY" ? <span className="block text-[10px] font-semibold text-blue-600">Approximate municipality pin</span> : location.precision === "UNMAPPED" ? <span className="block text-[10px] font-semibold text-amber-700">Pin unavailable</span> : null}</span><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-brand-blue shadow-sm">{location.loans}</span></button>{editable ? <button type="button" className="m-2 rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-brand-blue hover:text-brand-blue" onClick={() => beginEdit(location)} aria-label={`Edit pin for ${location.barangay}`} title="Edit pin"><Pencil className="h-3.5 w-3.5" /></button> : null}</div>; })}</div>
    </aside>
    <section className="panel relative min-h-0 overflow-hidden overscroll-contain" aria-label={`${officerName} barangay location map`}><div ref={mapElementRef} className="h-full min-h-0 w-full" />{loading ? <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/80"><p className="flex items-center gap-2 font-bold text-brand-blue"><LoaderCircle className="h-5 w-5 animate-spin" />Refreshing stored pins...</p></div> : null}{error ? <div className="absolute inset-x-4 top-4 z-[700] rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 shadow"><TriangleAlert className="mr-2 inline h-4 w-4" />{error}</div> : null}{editing ? <div className="absolute bottom-4 left-4 right-4 z-[650] max-w-xl rounded-lg border border-slate-200 bg-white p-4 shadow-xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-green">Edit Pin</p><h3 className="font-bold text-slate-950">{editing.barangay}, {editing.municipality}</h3><p className="mt-1 text-xs text-slate-500">Click the correct point on the map or enter coordinates.</p></div><button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(null)} aria-label="Close pin editor"><X className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">Latitude<input className="field mt-1" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label><label className="text-xs font-semibold text-slate-600">Longitude<input className="field mt-1" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label></div><div className="mt-2 rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-600"><b>Source:</b> {editing.coordinateSource ?? "Not available"}<br /><b>Last attempt:</b> {editing.geocodedAt ? new Date(editing.geocodedAt).toLocaleString("en-US") : "Never"}{editing.geocodeError ? <><br /><b className="text-red-700">Last error:</b> <span className="text-red-700">{editing.geocodeError}</span></> : null}</div><div className="mt-3 flex flex-wrap justify-end gap-2">{editing.latitude !== null || editing.longitude !== null || editing.precision === "MANUAL" ? <button type="button" className="btn-secondary h-9 px-3 text-xs" disabled={saving} onClick={() => void resetPin()}><RotateCcw className="h-4 w-4" />Reset &amp; retry automatic</button> : null}<button type="button" className="btn-primary h-9 px-3 text-xs" disabled={saving} onClick={() => void savePin()}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save manual pin</button></div></div> : null}</section>
  </div>;
}
