import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../api/client";

interface AuthState {
  token: string | null;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      username: null,
      login: async (username, password) => {
        const resp = await api.post<{ access_token: string; username: string }>(
          "/auth/login",
          { username, password }
        );
        set({ token: resp.access_token, username: resp.username });
      },
      logout: () => set({ token: null, username: null }),
    }),
    { name: "datapilot.auth" }
  )
);

interface UIState {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "light",
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
    }),
    { name: "datapilot.ui" }
  )
);
