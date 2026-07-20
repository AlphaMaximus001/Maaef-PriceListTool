import { redirect } from "next/navigation";

// Edit history is now the "Edit history & restore" tab inside Action Logs.
export default function HistoryRedirect() {
  redirect("/logs?tab=history");
}
