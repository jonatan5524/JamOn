/**
 * User API. Backend: GET /api/users/me (currently a stub).
 */
import { apiFetch } from "@/lib/mockApi/client";
import { delay } from "@/lib/mockApi/_mock";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

export interface CurrentUser {
  id: string;
  displayName: string;
  email?: string;
}

export const getCurrentUser = (): Promise<CurrentUser> =>
  USE_MOCKS
    ? delay({
        id: "user_mock",
        displayName: "Demo User",
      })
    : apiFetch<CurrentUser>("/api/users/me");
