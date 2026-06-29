import { redirect } from "next/navigation";

// Root simply forwards into the authenticated app. Middleware bounces
// unauthenticated users to /login before this renders.
export default function Home() {
  redirect("/dashboard");
}
