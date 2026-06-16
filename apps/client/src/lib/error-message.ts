import { ApiError } from "@/lib/api/client";

export interface FriendlyError {
  title: string;
  description: string;
}

const OFFLINE: FriendlyError = {
  title: "You're offline",
  description: "Check your internet connection and try again.",
};

const NETWORK: FriendlyError = {
  title: "Connection problem",
  description: "We couldn't reach the server. Check your connection and try again.",
};

const SERVER_ERROR: FriendlyError = {
  title: "Server error",
  description: "Something went wrong on our end. Try again shortly.",
};

const FALLBACK: FriendlyError = {
  title: "Something went wrong",
  description: "Please try again.",
};

const BY_STATUS: Record<number, FriendlyError> = {
  401: {
    title: "Session expired",
    description: "Please sign in again to continue.",
  },
  403: {
    title: "Access denied",
    description: "You don't have permission to view this.",
  },
  404: {
    title: "Not found",
    description: "We couldn't find what you were looking for.",
  },
  429: {
    title: "Too many requests",
    description: "Please wait a moment, then try again.",
  },
};

const isOffline = (): boolean =>
  typeof navigator !== "undefined" && navigator.onLine === false;

/** HTTP status from an ApiError or an axios-style error, if any. */
const getStatus = (err: unknown): number | undefined => {
  if (err instanceof ApiError) return err.status;
  const status = (err as { response?: { status?: number } })?.response?.status;
  return typeof status === "number" ? status : undefined;
};

/** True when the request never got a response (server unreachable). */
const isNetworkError = (err: unknown): boolean => {
  if (err instanceof TypeError) return true; // fetch() rejects this way
  const code = (err as { code?: string })?.code;
  if (code === "ERR_NETWORK" || code === "ECONNABORTED") return true;
  const e = err as { request?: unknown; response?: unknown };
  return Boolean(e?.request) && !e?.response; // axios: sent, no reply
};

/** Message the backend sent in the error body, if any. */
const getServerMessage = (err: unknown): string | undefined => {
  if (err instanceof ApiError) return err.message;
  const data = (
    err as { response?: { data?: { message?: string; error?: string } } }
  )?.response?.data;
  return data?.message ?? data?.error;
};

/** Map any thrown error to user-facing title + description. */
export const getErrorMessage = (err: unknown): FriendlyError => {
  if (isOffline()) return OFFLINE;

  const status = getStatus(err);
  if (status !== undefined) {
    if (BY_STATUS[status]) return BY_STATUS[status];
    if (status >= 500) return SERVER_ERROR;
  }

  if (isNetworkError(err)) return NETWORK;

  return { ...FALLBACK, description: getServerMessage(err) ?? FALLBACK.description };
};
