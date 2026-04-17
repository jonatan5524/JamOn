import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly clientId = process.env.SPOTIFY_CLIENT_ID;
  private readonly clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  private readonly redirectUri =
    process.env.SPOTIFY_REDIRECT_URI ||
    `${process.env.API_URL || "http://localhost:3000"}/auth/spotify/callback`;

  constructor(private readonly httpService: HttpService) {}

  getAuthorizationUrl(): { url: string } {
    const scopes = [
      "playlist-modify-public",
      "playlist-modify-private",
      "user-read-private",
      "user-read-email",
      "user-top-read",
    ];

    const params = new URLSearchParams([
      ["client_id", this.clientId || ""],
      ["response_type", "code"],
      ["redirect_uri", this.redirectUri],
      ["scope", scopes.join(" ")],
      ["show_dialog", "true"],
    ]);

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    this.logger.log(`Generated authorization URL for Spotify OAuth`);

    return { url: authUrl };
  }

  async exchangeCodeForToken(code: string): Promise<SpotifyTokenResponse> {
    this.logger.log("Exchanging authorization code for access token");

    try {
      const params = new URLSearchParams([
        ["grant_type", "authorization_code"],
        ["code", code],
        ["redirect_uri", this.redirectUri],
        ["client_id", this.clientId || ""],
        ["client_secret", this.clientSecret || ""],
      ]);

      const { data } = await firstValueFrom(
        this.httpService.post<SpotifyTokenResponse>(
          "https://accounts.spotify.com/api/token",
          params.toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          },
        ),
      );

      this.logger.log("Successfully exchanged code for access token");
      return data;
    } catch (error: any) {
      this.logger.error(
        `Failed to exchange code for token: ${error?.response?.status} ${
          error?.response?.data?.error || error.message
        }`,
      );
      throw error;
    }
  }
}
