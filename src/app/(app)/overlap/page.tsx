import { redirect } from "next/navigation";

// Undercut Radar now lives as a tab inside the combined Compare page.
export default function OverlapRedirect() {
  redirect("/compare?tab=overlap");
}
