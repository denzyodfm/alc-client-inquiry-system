import { redirect } from "next/navigation";

// The pivots each have their own route now. This keeps the old address, and anything already
// linking to it, pointing at the Location Pivot it used to open on.
export default function LocationMasterlistIndex() {
  redirect("/location-masterlist/location");
}
