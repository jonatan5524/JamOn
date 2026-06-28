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
} from "@/lib/mock-event";
import type { CreateEventRequest, PlaylistResponse } from "@/types/api";
import type { EventDetail, EventSummary, Participant } from "@/types/event";
import api from "./api";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

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

interface BackendPlaylistTrack {
  id: string;
  position: number;
  title: string;
  artist: string;
  spotifyUrl?: string;
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
  playlistTracks?: BackendPlaylistTrack[];
  statistics?: BackendEventStatistics | null;
}

interface BackendEventStatistics {
  playlistMatchPercent: number;
  tracks: {
    id: string;
    position: number;
    title: string;
    artist: string;
    spotifyUrl?: string;
    contributorIds: string[];
  }[];
  contributions: {
    participantId: string;
    participantName: string;
    percent: number;
  }[];
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
  const participantColorById = new Map(
    participants.map((participant) => [participant.id, participant.colorHex]),
  );
  return {
    id: String(raw.id),
    code: raw.code,
    name: raw.title,
    description: raw.context ?? "",
    participantCount: participants.length,
    inviteUrl: `${window.location.origin}/join/${raw.code}`,
    participants,
    mix: raw.playlistId
      ? (() => {
          const statsTracks = raw.statistics?.tracks ?? [];
          const fallbackTracks = raw.playlistTracks ?? [];
          const tracks = statsTracks.length > 0
            ? statsTracks.map((track) => ({
                id: track.id,
                position: track.position,
                title: track.title,
                artist: track.artist,
                spotifyUrl: track.spotifyUrl,
                contributorIds: track.contributorIds,
              }))
            : fallbackTracks.map((track) => ({
                id: track.id,
                position: track.position,
                title: track.title,
                artist: track.artist,
                spotifyUrl: track.spotifyUrl,
                contributorIds: [] as string[],
              }));
          return {
            id: raw.playlistId,
            trackCount: raw.tracksAdded ?? tracks.length,
            durationMin: Math.round(tracks.length * 3.5),
            spotifyUrl: raw.playlistUrl ?? "",
            tracks,
          };
        })()
      : null,
    contributions: (raw.statistics?.contributions ?? []).map((row) => ({
      participantId: row.participantId,
      participantName: row.participantName,
      percent: row.percent,
      colorHex:
        participantColorById.get(row.participantId) ??
        colorForUser(row.participantId),
    })),
    playlistMatchPercent: raw.statistics?.playlistMatchPercent,
    statisticsReady: raw.playlistId != null && raw.statistics != null,
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

// GET /api/events/my — JWT-guarded, user from token
export const myEventsList = async (): Promise<EventSummary[]> => {
   const response = (await api.get<BackendEvent[]>("/events/my")).data;
   return response.map((raw) => ({
     id: String(raw.id),
     code: raw.code,
     name: raw.title,
     description: raw.context ?? "",
     participantCount: raw.participants?.length ?? 0,
   }));
}

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
        statisticsReady: true,
      };
    }
    return delay({
      playlistId: `pl_${eventId}`,
      playlistUrl: MOCK_EVENT_DETAIL.mix?.spotifyUrl ?? "",
      tracksAdded: MOCK_EVENT_DETAIL.mix?.trackCount ?? 0,
      tracksNotFound: [],
      totalRequested: MOCK_EVENT_DETAIL.mix?.trackCount ?? 0,
      tracks: [],
    });
  }
  return api
    .post<PlaylistResponse>(`/events/${eventId}/generate-playlist`)
    .then((r) => r.data);
};
