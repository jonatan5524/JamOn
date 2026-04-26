/**
 * Mirrors orchestrator DTOs. Keep field names aligned with
 * apps/orchestrator/src/modules/**\/dto/*.dto.ts.
 *
 * Endpoints currently implemented in backend:
 *   POST /playlists/generate            — real
 *   GET  /auth/spotify/{authorize,callback}
 * Stubs (handlers return undefined):
 *   POST /api/events
 *   GET  /api/events/:id
 *   POST /api/events/:id/join
 *   POST /api/events/:id/generate-playlist
 *   GET  /api/users/me
 */

// --- Events (backend) -------------------------------------------------------

export interface CreateEventRequest {
  name: string;
  description: string;
}

export interface JoinEventRequest {
  userId: string;
}

// --- Playlist (backend) -----------------------------------------------------

export interface CreatePlaylistRequest {
  eventDescription: string;
  playlistName?: string;
}

export interface PlaylistResponse {
  playlistId: string;
  playlistUrl: string;
  tracksAdded: number;
  tracksNotFound: string[];
  totalRequested: number;
}

export const PlaylistError = {
  SPOTIFY_AUTH_EXPIRED: "SPOTIFY_AUTH_EXPIRED",
  NO_TRACKS_RESOLVED: "NO_TRACKS_RESOLVED",
  PLAYLIST_CREATION_FAILED: "PLAYLIST_CREATION_FAILED",
  AI_SERVICE_BUSY: "AI_SERVICE_BUSY",
} as const;
export type PlaylistErrorCode =
  (typeof PlaylistError)[keyof typeof PlaylistError];

export interface ApiErrorBody {
  error?: PlaylistErrorCode | string;
  message?: string;
}
