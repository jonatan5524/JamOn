const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";

const ACCESS_TOKEN_KEY = "jamon_access_token";
const REFRESH_TOKEN_KEY = "jamon_refresh_token";

export const getAccessToken = (): string | null =>
  localStorage.getItem(ACCESS_TOKEN_KEY);

export const getRefreshToken = (): string | null =>
  localStorage.getItem(REFRESH_TOKEN_KEY);

export const setTokens = (accessToken: string, refreshToken: string): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

let inFlight: Promise<string> | null = null;

export const refreshAccessToken = (): Promise<string> => {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error("No refresh token available");

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) throw new Error("Token refresh failed");

    const { appAccessToken, appRefreshToken } = await response.json();
    setTokens(appAccessToken, appRefreshToken);
    return appAccessToken as string;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
};

export const onAuthFailure = (): void => {
  clearTokens();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
};
