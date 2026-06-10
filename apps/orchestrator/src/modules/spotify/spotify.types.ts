export interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[];
}

export interface SpotifyTrack {
  uri: string;
  name: string;
  id: string;
  artists: SpotifyArtist[];
}

export interface SpotifySearchResponse {
  tracks: {
    items: SpotifyTrack[];
  };
}


export interface SpotifyPlaylistResponse {
  id: string;
  external_urls: { spotify: string };
}

export interface SpotifyPlaylist {
  id: string;
  url: string;
}

export interface SimplifiedTrack {
  title: string;
  artist: string;
}

export interface SpotifyTopTracksResponse {
  items: SpotifyTrack[];
  total: number;
  limit: number;
  offset: number;
  href: string;
  next: string | null;
  previous: string | null;
}

export interface SpotifyPlaylistTrack {
  track: SpotifyTrack | null;
}

export interface SpotifyPlaylistTracksResponse {
  items: SpotifyPlaylistTrack[];
  next: string | null;
}
