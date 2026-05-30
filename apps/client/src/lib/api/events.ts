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
import type { CreateEventRequest, PlaylistResponse } from "@/types/api";
import type { EventDetail, EventSummary, Participant } from "@/types/event";
import api from "./api";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

// GET /api/events — endpoint does not exist on backend yet.
export const listEvents = (): Promise<EventSummary[]> =>
  USE_MOCKS ? delay(MOCK_EVENT_SUMMARIES) : apiFetch<EventSummary[]>("/events");

interface BackendUser {
  id: string;
  displayName?: string | null;
  email?: string | null;
  profileImage?: string | null;
}

interface BackendParticipant {
  userId: string;
  joinedAt: string;
  user?: BackendUser;
}

interface BackendEvent {
  id: string;
  code: string;
  title: string;
  context: string | null;
  createdAt: string;
  participants?: BackendParticipant[];
  viewerRole?: "creator" | "participant";
  playlistId?: string | null;
  playlistUrl?: string | null;
  tracksAdded?: number | null;
}

const PARTICIPANT_COLORS = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
];

const colorForUser = (userId: string): string => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return PARTICIPANT_COLORS[Math.abs(hash) % PARTICIPANT_COLORS.length];
};

const mapParticipant = (p: BackendParticipant): Participant => {
  const name = p.user?.displayName?.trim() || p.user?.email || p.userId;
  return {
    id: p.userId,
    name,
    initial: name.charAt(0).toUpperCase(),
    colorHex: colorForUser(p.userId),
    source: "spotify",
    activity: 0,
  };
};

// GET /api/events/:id
export const getEvent = async (eventId: string): Promise<EventDetail> => {
  const raw = await apiFetch<BackendEvent>(`/events/${eventId}`);
  const participants = (raw.participants ?? []).map(mapParticipant);
  return {
    id: String(raw.id),
    code: raw.code,
    name: raw.title,
    description: raw.context ?? "",
    participantCount: participants.length,
    inviteUrl: `${window.location.origin}/join/${raw.code}`,
    participants,
    mix: raw.playlistId
      ? {
          id: raw.playlistId,
          trackCount: raw.tracksAdded ?? 0,
          durationMin: Math.round((raw.tracksAdded ?? 0) * 3.5),
          spotifyUrl: raw.playlistUrl ?? "",
          tracks: [],
        }
      : null,
    contributions: [],
    viewerRole: raw.viewerRole ?? "participant",
  };
};

// GET /api/events/by-code/:code
export const findEventByCode = async (code: string): Promise<EventSummary> => {
  const normalized = code.trim().toUpperCase();
  const raw = await apiFetch<BackendEvent>(
    `/events/by-code/${encodeURIComponent(normalized)}`,
  );
  return {
    id: String(raw.id),
    code: raw.code,
    name: raw.title,
    description: raw.context ?? "",
    participantCount: raw.participants?.length ?? 0,
  };
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

// POST /api/events/:id/join — JWT-guarded, user from token
export const joinEvent = async (eventId: string): Promise<void> => {
  await api.post(`/events/${eventId}/join`);
};

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
  return api
    .post<PlaylistResponse>(`/events/${eventId}/generate-playlist`)
    .then((r) => r.data);
};
