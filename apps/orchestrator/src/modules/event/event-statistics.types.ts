export interface EventStatistics {
  playlistMatchPercent: number;
  tracks: Array<{
    id: string;
    position: number;
    title: string;
    artist: string;
    spotifyUrl?: string;
    contributorIds: string[];
  }>;
  contributions: Array<{
    participantId: string;
    participantName: string;
    percent: number;
  }>;
}
