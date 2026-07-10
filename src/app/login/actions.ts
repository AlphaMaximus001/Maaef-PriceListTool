"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || email } },
  });

  if (error) {
    return { error: error.message };
  }

  // No active session back means the project requires email confirmation.
  if (!data.session) {
    return {
      error: null,
      notice: "Account created. Check your email to confirm, then sign in. You'll start with read-only access — ask an admin for more.",
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
