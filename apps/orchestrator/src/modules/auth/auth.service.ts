import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { randomBytes } from "crypto";

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
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri =
    process.env.SPOTIFY_REDIRECT_URI ||
    `${process.env.API_URL || "http://localhost:3000"}/auth/spotify/callback`;

  constructor(private readonly httpService: HttpService) {
    this.clientId = process.env.SPOTIFY_CLIENT_ID || "";
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "Missing Spotify OAuth configuration: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required",
      );
    }
  }

  getAuthorizationUrl(): { url: string; state: string } {
    const scopes = [
      "playlist-modify-public",
      "playlist-modify-private",
      "user-read-private",
      "user-read-email",
      "user-top-read",
    ];
    const state = randomBytes(16).toString("hex");

    const params = new URLSearchParams([
      ["client_id", this.clientId],
      ["response_type", "code"],
      ["redirect_uri", this.redirectUri],
      ["scope", scopes.join(" ")],
      ["state", state],
      ["show_dialog", "true"],
    ]);

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    this.logger.log(`Generated authorization URL for Spotify OAuth`);

    return { url: authUrl, state };
  }

  async exchangeCodeForToken(code: string): Promise<SpotifyTokenResponse> {
    this.logger.log("Exchanging authorization code for access token");

    try {
      const params = new URLSearchParams([
        ["grant_type", "authorization_code"],
        ["code", code],
        ["redirect_uri", this.redirectUri],
        ["client_id", this.clientId],
        ["client_secret", this.clientSecret],
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
      throw new HttpException(
        {
          error: "Failed to exchange authorization code",
          details: error?.response?.data?.error || error.message,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
