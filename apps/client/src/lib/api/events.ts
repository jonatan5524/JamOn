/**
 * Event API. Backend routes from apps/orchestrator/src/modules/event.
 *
 * Most backend handlers are stubs (return undefined). All functions here
 * currently return mock data so the UI is wired end-to-end. Flip
 * `VITE_USE_MOCKS=false` once endpoints land — each function dispatches
 * to either `apiFetch` or its mock counterpart.
 */
import { apiFetch } from "./client";
import { delay } from "@/lib/api/_mock";
import {
  MOCK_EVENT_DETAIL,
  MOCK_EVENT_DETAILS,
  MOCK_EVENT_SUMMARIES,
} from "@/lib/mock-event";
import type {
  CreateEventRequest,
  JoinEventRequest,
  PlaylistResponse,
} from "@/types/api";
import type { EventDetail, EventSummary } from "@/types/event";
import api from "./api";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

// GET /api/events — endpoint does not exist on backend yet.
export const listEvents = (): Promise<EventSummary[]> =>
  USE_MOCKS
    ? delay(MOCK_EVENT_SUMMARIES)
    : apiFetch<EventSummary[]>("/api/events");

// GET /api/events/:id — backend stub; response shape speculative.
export const getEvent = (eventId: string): Promise<EventDetail> =>
  USE_MOCKS
    ? delay(
        MOCK_EVENT_DETAILS[eventId] ?? { ...MOCK_EVENT_DETAIL, id: eventId },
      )
    : apiFetch<EventDetail>(`/api/events/${eventId}`);

// No matching backend endpoint yet. Likely a query param on listEvents
// or a dedicated GET /api/events/by-code/:code.
export const findEventByCode = async (code: string): Promise<EventSummary> => {
  const normalized = code.trim().toUpperCase();
  if (USE_MOCKS) {
    const summary = MOCK_EVENT_SUMMARIES.find((e) => e.code === normalized);
    if (!summary) {
      await delay(null, 400);
      throw new Error("Event not found");
    }
    return delay(summary);
  }
  return apiFetch<EventSummary>(
    `/api/events/by-code/${encodeURIComponent(normalized)}`,
  );
};

// POST /api/events
export const createEvent = async (
  payload: CreateEventRequest,
): Promise<EventSummary> => {

  console.log("Creating event with payload:", payload);
  const response = await api.post<EventSummary>("/events", {
    title: payload.title,
    context: payload.context,
  });

  return response.data;
};

// POST /api/events/:id/join
export const joinEvent = (
  eventId: string,
  payload: JoinEventRequest,
): Promise<EventDetail> =>
  USE_MOCKS
    ? delay({ ...MOCK_EVENT_DETAIL, id: eventId })
    : apiFetch<EventDetail>(`/api/events/${eventId}/join`, {
        method: "POST",
        body: payload,
      });

// POST /api/events/:id/generate-playlist
// Backend stub. Legacy POST /playlists/generate returns PlaylistResponse.
// Mock side-effects MOCK_EVENT_DETAILS[id] so the next getEvent call returns
// the mix — letting React Query refetch reflect the new state.
export const generateEventPlaylist = async (
  eventId: string,
): Promise<PlaylistResponse> => {
  if (USE_MOCKS) {
    const existing = MOCK_EVENT_DETAILS[eventId];
    if (existing) {
      MOCK_EVENT_DETAILS[eventId] = {
        ...existing,
        mix: MOCK_EVENT_DETAIL.mix,
        contributions: existing.contributions.length
          ? existing.contributions
          : MOCK_EVENT_DETAIL.contributions,
      };
    }
    return delay({
      playlistId: `pl_${eventId}`,
      playlistUrl: MOCK_EVENT_DETAIL.mix?.spotifyUrl ?? "",
      tracksAdded: MOCK_EVENT_DETAIL.mix?.trackCount ?? 0,
      tracksNotFound: [],
      totalRequested: MOCK_EVENT_DETAIL.mix?.trackCount ?? 0,
    });
  }
  return apiFetch<PlaylistResponse>(
    `/api/events/${eventId}/generate-playlist`,
    { method: "POST" },
  );
};
