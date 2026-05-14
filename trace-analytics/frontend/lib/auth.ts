"use client";

export function saveAuth(token: string, user: { email: string; name: string; role: string }) {
  localStorage.setItem("trace_token", token);
  localStorage.setItem("trace_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("trace_token");
  localStorage.removeItem("trace_user");
}

export function getUser(): { email: string; name: string; role: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("trace_user");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("trace_token");
}
