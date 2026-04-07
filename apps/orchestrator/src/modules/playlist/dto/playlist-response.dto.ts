export enum PlaylistError {
  SPOTIFY_AUTH_EXPIRED = 'SPOTIFY_AUTH_EXPIRED',
  NO_TRACKS_RESOLVED = 'NO_TRACKS_RESOLVED',
  PLAYLIST_CREATION_FAILED = 'PLAYLIST_CREATION_FAILED',
  AI_SERVICE_BUSY = 'AI_SERVICE_BUSY',
}

export interface PlaylistResponseDto {
  playlistId: string;
  playlistUrl: string;
  tracksAdded: number;
  tracksNotFound: string[];
  totalRequested: number;
}