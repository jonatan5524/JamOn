/**
 * Domain types — what the UI consumes.
 *
 * These mirror what the backend is *expected* to return, plus a presentation
 * layer (`Participant.initial`/`colorHex`) derived in the mock today and that
 * should move to a view-model helper once the backend defines the wire shape.
 *
 * Wire DTOs (request/response shapes mirroring orchestrator) live in
 * `src/types/api.ts`.
 */

export interface EventSummary {
  id: string;
  code: string;
  name: string;
  description: string;
  participantCount: number;
}

export interface Participant {
  id: string;
  name: string;
  /** Single-letter avatar — derived from `name` for now. */
  initial: string;
  /** Avatar background — derived from `id` for now. */
  colorHex: string;
  source: "spotify";
  activity: number;
}

export interface Track {
  id: string;
  position: number;
  title: string;
  artist: string;
  contributorIds: string[];
  spotifyUrl?: string;
}

export interface JamOnMix {
  id: string;
  trackCount: number;
  durationMin: number;
  spotifyUrl: string;
  tracks: Track[];
}

export interface TasteContribution {
  participantId: string;
  participantName: string;
  percent: number;
  colorHex: string;
}

export type EventRole = "creator" | "participant";

export interface EventDetail extends EventSummary {
  inviteUrl: string;
  participants: Participant[];
  mix: JamOnMix | null;
  contributions: TasteContribution[];
  playlistMatchPercent?: number;
  /** Current viewer's role on this event, from the backend. */
  viewerRole: EventRole;
}
