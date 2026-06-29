import {Injectable, Logger} from '@nestjs/common';
import {HttpService} from '@nestjs/axios';
import {ConfigService} from '@nestjs/config';
import {firstValueFrom} from 'rxjs';
import { SpotifyClientRegistry } from './spotify-client.registry';
import {
  SimplifiedTrack,
  SpotifyPlaylist,
  SpotifyPlaylistResponse,
  SpotifyPlaylistTracksResponse,
  SpotifySearchResponse,
  SpotifyTrackMatch,
  SpotifyTopTracksResponse,
} from './spotify.types';

@Injectable()
export class SpotifyService {
  private readonly logger = new Logger(SpotifyService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly clientRegistry: SpotifyClientRegistry,
  ) {}

  getAppToken = async (): Promise<string> => {
    const { clientId, clientSecret } = this.clientRegistry.getDefault();
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const { data } = await firstValueFrom(
      this.httpService.post<{ access_token: string }>(
        'https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );
    return data.access_token;
  };

  private spotifyRequest = async <T>(
    accessToken: string,
    method: 'get' | 'post',
    path: string,
    data?: unknown,
  ): Promise<T> => {
    try {
      const { data: responseData } = await firstValueFrom(
        this.httpService.request<T>({
          method,
          url: path,
          data,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );
      return responseData;
    } catch (error: any) {
      this.logger.error(`Spotify ${method.toUpperCase()} ${path} failed: ${error?.response?.status} ${error?.response?.data?.error?.message || error.message}`);
      throw error;
    }
  };

  getTopTracks = async (accessToken: string, limit: number = 50): Promise<SimplifiedTrack[]> => {
    this.logger.log(`Fetching user's top ${limit} tracks`);
    const data = await this.spotifyRequest<SpotifyTopTracksResponse>(
      accessToken,
      'get',
      `/me/top/tracks?limit=${limit}`,
    );
    return data.items.map((track) => ({
      title: track.name,
      artist: track.artists[0]?.name || '',
    }));
  };

  searchTrackDetails = async (accessToken: string, title: string, artist: string): Promise<SpotifyTrackMatch | null> => {
    this.logger.log(`Searching: "${title}" by ${artist}`);
    const query = encodeURIComponent(`track:${title} artist:${artist}`);
    const data = await this.spotifyRequest<SpotifySearchResponse>(
      accessToken,
      'get',
      `/search?q=${query}&type=track&limit=1`,
    );
    const items = data.tracks?.items ?? [];
    if (items.length === 0) {
      this.logger.warn(`Track not found: "${title}" by ${artist}`);
      return null;
    }
    const track = items[0];
    return {
      id: track.id,
      uri: track.uri,
      title: track.name,
      artist: track.artists[0]?.name || artist,
      url: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`,
    };
  };

  searchTrack = async (accessToken: string, title: string, artist: string): Promise<string | null> => {
    const match = await this.searchTrackDetails(accessToken, title, artist);
    return match?.uri ?? null;
  };


  createPlaylist = async (
    accessToken: string,
    name: string,
    isPublic: boolean,
    description: string,
  ): Promise<SpotifyPlaylist> => {
    this.logger.log(`Creating playlist: "${name}"`);
    const playlist = await this.spotifyRequest<SpotifyPlaylistResponse>(
      accessToken,
      'post',
      `/me/playlists`,
      { name, public: isPublic, description },
    );
    return {
      id: playlist.id,
      url: playlist.external_urls.spotify,
    };
  };

  addTracksToPlaylist = async (accessToken: string, playlistId: string, uris: string[]): Promise<void> => {
    this.logger.log(`Adding ${uris.length} tracks to playlist ${playlistId}`);
    await this.spotifyRequest(
      accessToken,
      'post',
      `/playlists/${playlistId}/items`,
      { uris },
    );
  };

  getChartTracks = async (playlistId: string): Promise<SimplifiedTrack[]> => {
    this.logger.log(`Fetching chart tracks for playlist ${playlistId}`);
    const token = await this.getAppToken();
    const data = await this.spotifyRequest<SpotifyPlaylistTracksResponse>(
      token,
      'get',
      `/playlists/${playlistId}/tracks?limit=50`,
    );
    return data.items
      .filter((item) => item.track !== null)
      .map((item) => ({
        title: item.track!.name,
        artist: item.track!.artists[0]?.name || '',
      }));
  };
}
