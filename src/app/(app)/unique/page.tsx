import { redirect } from "next/navigation";

// Pricing Power now lives as a tab inside the combined Compare page.
export default function UniqueRedirect() {
  redirect("/compare?tab=unique");
}
