import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { randomBytes } from "crypto";
import { UserService } from "../user/user.service";
import { SpotifyService } from "../spotify/spotify.service";
import { DataEngineService } from "../data-engine/data-engine.service";
import { SongService } from "../song/song.service";

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly spotifyService: SpotifyService,
    private readonly dataEngineService: DataEngineService,
    private readonly songService: SongService,
  ) { }

  async handleLogin(code: string) {
    const spotifyTokens = await this.exchangeCodeForToken(code);

    const spotifyProfile = await this.getSpotifyProfile(spotifyTokens.access_token);

    const user = await this.userService.findOrCreateBySpotifyId(
      spotifyProfile,
      spotifyTokens.refresh_token,
      spotifyTokens.access_token
    );

    const payload = {userId: user.id};

    const appAccessToken = this.jwtService.sign(payload, {
      expiresIn: '1h'
    });
    const appRefreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d'
    });

    await this.userService.updateAppRefreshToken(user.id, appRefreshToken);

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (!user.lastUpdatedSongs || user.lastUpdatedSongs < oneWeekAgo) {
      this.triggerLibrarySync(spotifyTokens.access_token, user.id);
    }

    return {
      appAccessToken,
      appRefreshToken,
      spotifyAccessToken: spotifyTokens.access_token,
    };
  }

  private async triggerLibrarySync(spotifyAccessToken: string, userId: string): Promise<void> {
    try {
      const tracks = await this.spotifyService.getTopTracks(spotifyAccessToken);
      const songs = await this.songService.upsertSongsFromTracks(tracks);

      await this.songService.bulkUpsertLikes(userId, songs.map((s) => s.id));
      this.logger.log(`Library sync: saved ${songs.length} song(s) and updated likes for user ${userId}`);

      const unindexed = songs.filter((s) => !s.embedding);
      if (unindexed.length === 0) {
        this.logger.log('Library sync: all tracks already have embeddings');
      } else {
        this.logger.log(`Library sync: sending ${unindexed.length} track(s) to data-engine for embedding`);
        const simplifiedTracks = unindexed.map((s) => ({ title: s.name, artist: s.artistName }));
        const dtos = await this.dataEngineService.ingestBatch(simplifiedTracks);
        await this.songService.updateEmbeddings(dtos);
      }

      await this.userService.updateLastUpdatedSongs(userId);
      this.logger.log('Library sync complete');
    } catch (error: any) {
      this.logger.error(`Library sync failed: ${error.message}`);
    }
  }

  private async getSpotifyProfile(accessToken: string) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get("https://api.spotify.com/v1/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      );
      return data;
    } catch (error) {
      throw new HttpException("Failed to fetch Spotify profile", HttpStatus.BAD_GATEWAY);
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

    const params = new URLSearchParams({
      client_id: this.configService.get<string>('SPOTIFY_CLIENT_ID') || '',
      response_type: 'code',
      redirect_uri: this.configService.get<string>('SPOTIFY_REDIRECT_URI') || '',
      scope: scopes.join(" "),
      state: state,
      show_dialog: "true",
    });

    this.logger.log(`Generated authorization URL for Spotify OAuth`);

    return { url: `https://accounts.spotify.com/authorize?${params.toString()}`, state };
  }

  async exchangeCodeForToken(code: string): Promise<SpotifyTokenResponse> {
    this.logger.log("Exchanging authorization code for access token");
    try {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: this.configService.get<string>('SPOTIFY_REDIRECT_URI') || '',
        client_id: this.configService.get<string>('SPOTIFY_CLIENT_ID') || '',
        client_secret: this.configService.get<string>('SPOTIFY_CLIENT_SECRET') || '',
      });

      const { data } = await firstValueFrom(
        this.httpService.post<SpotifyTokenResponse>(
          "https://accounts.spotify.com/api/token",
          params.toString(),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        )
      );

      this.logger.log("Successfully exchanged code for access token");
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to exchange code: ${error.message}`);
      throw new HttpException("Failed to exchange token", HttpStatus.BAD_GATEWAY);
    }
  }

  handleLogout(userId: string): void {
    this.logger.log(`Handling logout for user ID: ${userId}`);
    this.userService.updateAppRefreshToken(userId, null).catch(error => {
      this.logger.error(`Failed to clear refresh token for user ID ${userId}: ${error.message}`);
    });
  }

  async refreshTokens(refreshToken: string) {
    const payload = this.jwtService.decode(refreshToken);
    if (!payload) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.userService.findById(payload.userId);
    if (!user || user.appRefreshToken !== refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newPayload = { userId: user.id };
    const newAccessToken = this.jwtService.sign(newPayload, { expiresIn: '1h' });
    const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });

    await this.userService.updateAppRefreshToken(user.id, newRefreshToken);

    return {
      appAccessToken: newAccessToken,
      appRefreshToken: newRefreshToken
    };
  }
}