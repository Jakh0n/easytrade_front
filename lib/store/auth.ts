import { create } from "zustand";
import {
  clearToken,
  fetchMe,
  getToken,
  login as apiLogin,
  register as apiRegister,
  setToken,
} from "@/lib/api";
import type { PublicUser, UserSettings } from "@/lib/api";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: PublicUser | null;
  status: AuthStatus;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  applySettings: (settings: UserSettings) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",

  initialize: async () => {
    const token = getToken();
    if (!token) {
      set({ status: "unauthenticated" });
      return;
    }

    set({ status: "loading" });
    try {
      const user = await fetchMe();
      set({ user, status: "authenticated" });
    } catch {
      clearToken();
      set({ user: null, status: "unauthenticated" });
    }
  },

  login: async (email, password) => {
    const { token, user } = await apiLogin(email, password);
    setToken(token);
    set({ user, status: "authenticated" });
  },

  register: async (email, password, name) => {
    const { token, user } = await apiRegister(email, password, name);
    setToken(token);
    set({ user, status: "authenticated" });
  },

  logout: () => {
    clearToken();
    set({ user: null, status: "unauthenticated" });
  },

  applySettings: (settings) =>
    set((state) =>
      state.user ? { user: { ...state.user, settings } } : {},
    ),
}));
