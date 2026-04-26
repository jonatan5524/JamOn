import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface TokenData {
  accessToken: string;
  expiresIn: number;
}

const OAUTH_STORAGE_KEY = "jamon_spotify_token";
const TOKEN_EXPIRY_KEY = "jamon_token_expiry";
const tokenStorage = sessionStorage;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const BYPASS_AUTH = import.meta.env.VITE_BYPASS_AUTH === "true";

const readToken = (): string | null => {
  if (BYPASS_AUTH) return "bypass-token";
  const tokenJson = tokenStorage.getItem(OAUTH_STORAGE_KEY);
  const expiryTime = tokenStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!tokenJson || !expiryTime) return null;
  if (Date.now() > parseInt(expiryTime, 10)) return null;
  try {
    const parsed = JSON.parse(tokenJson) as TokenData;
    return parsed.accessToken;
  } catch {
    return null;
  }
};

const clearToken = () => {
  tokenStorage.removeItem(OAUTH_STORAGE_KEY);
  tokenStorage.removeItem(TOKEN_EXPIRY_KEY);
};

export const useSpotifyAuth = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Capture #access_token=... from Spotify implicit-grant callback.
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const expiresIn = params.get("expires_in");
    if (!accessToken) return;

    const tokenData: TokenData = {
      accessToken,
      expiresIn: expiresIn ? parseInt(expiresIn, 10) : 3600,
    };
    tokenStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(tokenData));
    tokenStorage.setItem(
      TOKEN_EXPIRY_KEY,
      (Date.now() + tokenData.expiresIn * 1000).toString(),
    );
    window.location.hash = "";
    navigate("/");
  }, [navigate]);

  // Drop expired token from storage on mount.
  useEffect(() => {
    const expiry = tokenStorage.getItem(TOKEN_EXPIRY_KEY);
    if (expiry && Date.now() > parseInt(expiry, 10)) {
      clearToken();
    }
  }, []);

  const startSpotifyLogin = useCallback(() => {
    try {
      setIsLoading(true);
      setError(null);
      window.location.href = `${API_URL}/auth/spotify/authorize`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setIsLoading(false);
    }
  }, []);

  const getAccessToken = useCallback((): string | null => readToken(), []);

  const isAuthenticated = useCallback(
    (): boolean => readToken() !== null,
    [],
  );

  const logout = useCallback(() => {
    clearToken();
    navigate("/login");
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
