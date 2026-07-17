import { redirect } from "next/navigation";

// Market Gap now lives as a tab inside the combined Compare page.
export default function MarketGapRedirect() {
  redirect("/compare?tab=gap");
}
