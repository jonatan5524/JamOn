export interface SpotifyTrack {
  uri: string;
  name: string;
  id: string;
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
