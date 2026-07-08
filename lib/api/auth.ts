import { apiFetch } from "./client";
import type { AuthResponse, PublicUser, UserSettings } from "./types";

export function register(
  email: string,
  password: string,
  name: string,
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: { email, password, name },
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function fetchMe(): Promise<PublicUser> {
  const data = await apiFetch<{ user: PublicUser }>("/api/auth/me", {
    auth: true,
  });
  return data.user;
}

export async function updateSettings(
  settings: Partial<UserSettings>,
): Promise<PublicUser> {
  const data = await apiFetch<{ user: PublicUser }>("/api/auth/settings", {
    method: "PATCH",
    body: settings,
    auth: true,
  });
  return data.user;
}
