"use client";

import { useState } from "react";

export function ClientLogLiveSearch({ defaultValue, suggestions }: { defaultValue: string; suggestions: string[] }) {
  const [value, setValue] = useState(defaultValue);
  return <>
    <input className="field" name="client" value={value} placeholder="Client, number, branch, or activity" list="client-log-search-suggestions" autoComplete="off" onChange={(event) => { const next = event.target.value; setValue(next); window.dispatchEvent(new CustomEvent("client-log-live-filter", { detail: next })); }} />
    <datalist id="client-log-search-suggestions">{suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>
  </>;
}
