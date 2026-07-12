"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/** The origin the request actually came from (works on Render behind a proxy). */
async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export type LoginState = { error: string | null; notice?: string | null };

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/dashboard");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Those credentials didn't work. Check and try again." };
  }

  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/dashboard");
}

/**
 * Open self-registration. Every new account is created as a read-only VIEWER
 * (the profile row + role are set by the `handle_new_user` DB trigger — the
 * client can never choose a higher role). An admin later grants more from the
 * Admin page. If the Supabase project requires email confirmation, we return a
 * notice; otherwise the user is signed in and sent to the dashboard.
 */
export async function signUp(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Enter your email and a password." };
  }
  if (password.length < 8) {
    return { error: "Use at least 8 characters for your password." };
  }

  const supabase = await createClient();
  // Point the confirmation link back at THIS deployment (not Supabase's Site
  // URL default of localhost). The URL must also be in Supabase's Redirect URL
  // allowlist, or Supabase falls back to the Site URL.
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || email },
      ...(origin ? { emailRedirectTo: `${origin}/login` } : {}),
    },
  });

  if (error) {
    return { error: error.message };
  }

  // No active session back means the project requires email confirmation.
  if (!data.session) {
    return {
      error: null,
      notice: "Account created. Check your email to confirm, then sign in. An admin must approve your access before you can see anything.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
