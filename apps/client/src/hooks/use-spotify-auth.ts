import api from "../lib/api/api";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const ACCESS_TOKEN_KEY = "jamon_access_token";
const REFRESH_TOKEN_KEY = "jamon_refresh_token";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const BYPASS_AUTH = import.meta.env.VITE_BYPASS_AUTH === "true";

const clearToken = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const useSpotifyAuth = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = useCallback((): boolean => {
    if (BYPASS_AUTH) return true;
    return !!localStorage.getItem(ACCESS_TOKEN_KEY);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const appAccessToken = params.get("appAccessToken");
    const appRefreshToken = params.get("appRefreshToken");
    const spotifyError = params.get("error");

    if (spotifyError) {
      setError(spotifyError);
      return;
    }

    if (appAccessToken && appRefreshToken) {
      localStorage.setItem(ACCESS_TOKEN_KEY, appAccessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, appRefreshToken);

      navigate("/", { replace: true });
    }
  }, [navigate]);

  const startSpotifyLogin = useCallback(
    async (email: string): Promise<"redirecting" | "ineligible" | "error"> => {
      try {
        setIsLoading(true);
        setError(null);

        // Preflight: is this email registered for testing? Checking before the
        // full-page redirect lets us show a fallback screen instead of the
        // backend's raw 400 JSON.
        const res = await fetch(
          `${API_URL}/auth/spotify/eligibility?email=${encodeURIComponent(email)}`,
        );
        const data = (await res.json().catch(() => null)) as {
          eligible?: boolean;
        } | null;

        if (!res.ok || !data?.eligible) {
          setIsLoading(false);
          return "ineligible";
        }

        window.location.href = `${API_URL}/auth/spotify/authorize?email=${encodeURIComponent(email)}`;
        return "redirecting";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
        setIsLoading(false);
        return "error";
      }
    },
    [],
  );

  const getAccessToken = useCallback((): string | null => {
    if (BYPASS_AUTH) return "bypass-token";
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }, []);

  const logout = useCallback(async () => {
    try {
      const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);

      if (accessToken) {
        await api.post("/auth/logout");
      }
    } catch (err) {
      console.error("Failed to invalidate token on backend during logout", err);
    } finally {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  return {
    startSpotifyLogin,
    getAccessToken,
    logout,
    isAuthenticated,
    isLoading,
    error,
  };
};