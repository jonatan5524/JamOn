import type { ApiErrorBody } from "@/types/api";
import {
  getAccessToken,
  onAuthFailure,
  refreshAccessToken,
} from "./auth-tokens";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;
  constructor(status: number, message: string, body: ApiErrorBody | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  token?: string | null;
}

export const apiFetch = async <T>(
  path: string,
  { body, token, headers, ...rest }: RequestOptions = {},
): Promise<T> => {
  const buildHeaders = (authToken: string | null): Record<string, string> => {
    const finalHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(headers as Record<string, string> | undefined),
    };
    if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
    if (authToken) finalHeaders.Authorization = `Bearer ${authToken}`;
    return finalHeaders;
  };

  const serializedBody =
    body !== undefined ? JSON.stringify(body) : undefined;

  const send = (authToken: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: buildHeaders(authToken),
      body: serializedBody,
    });

  let response = await send(token ?? getAccessToken());

  // Only auto-refresh when relying on the stored token (not an explicit one).
  if (response.status === 401 && token == null) {
    try {
      const refreshed = await refreshAccessToken();
      response = await send(refreshed);
    } catch {
      onAuthFailure();
    }
  }

  if (!response.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await response.json()) as ApiErrorBody;
    } catch {
      parsed = null;
    }
    throw new ApiError(
      response.status,
      parsed?.message ?? response.statusText,
      parsed,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};
