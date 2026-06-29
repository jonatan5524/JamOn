import { SpotifyClient } from "../modules/spotify/spotify-client.types";

declare global {
  namespace Express {
    interface Request {
      spotifyClient?: SpotifyClient;
    }
  }
}

export {};
