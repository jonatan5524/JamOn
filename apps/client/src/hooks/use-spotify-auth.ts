import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface TokenData {
  accessToken: string;
  expiresIn: number;
}

const OAUTH_STORAGE_KEY = "jamon_spotify_token";
const TOKEN_EXPIRY_KEY = "jamon_token_expiry";

export const useSpotifyAuth = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  // Check for callback from Spotify OAuth
  useEffect(() => {
    const handleCallback = () => {
      // Check if we have a token in the URL hash
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const expiresIn = params.get("expires_in");

      if (accessToken) {
        // Store token
        const tokenData: TokenData = {
          accessToken,
          expiresIn: expiresIn ? parseInt(expiresIn, 10) : 3600,
        };
        localStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(tokenData));
        localStorage.setItem(
          TOKEN_EXPIRY_KEY,
          (Date.now() + parseInt(expiresIn || "3600", 10) * 1000).toString(),
        );

        // Clear hash and redirect
        window.location.hash = "";
        navigate("/");
      }
    };

    handleCallback();
  }, [navigate]);

  const startSpotifyLogin = () => {
    try {
      setIsLoading(true);
      setError(null);

      // Redirect directly to the backend authorization endpoint
      // The backend will redirect to Spotify
      window.location.href = `${API_URL}/auth/spotify/authorize`;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An error occurred during login";
      setError(message);
      setIsLoading(false);
    }
  };

  const getAccessToken = (): string | null => {
    const tokenJson = localStorage.getItem(OAUTH_STORAGE_KEY);
    const expiryTime = localStorage.getItem(TOKEN_EXPIRY_KEY);

    if (!tokenJson || !expiryTime) {
      return null;
    }

    // Check if token has expired
    if (Date.now() > parseInt(expiryTime, 10)) {
      localStorage.removeItem(OAUTH_STORAGE_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      return null;
    }

    const tokenData: TokenData = JSON.parse(tokenJson);
    return tokenData.accessToken;
  };

  const logout = () => {
    localStorage.removeItem(OAUTH_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    navigate("/");
  };

  const isAuthenticated = (): boolean => {
    return getAccessToken() !== null;
  };

  return {
    startSpotifyLogin,
    getAccessToken,
    logout,
    isAuthenticated,
    isLoading,
    error,
  };
};
