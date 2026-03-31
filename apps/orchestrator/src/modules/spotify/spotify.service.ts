import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  SpotifyPlaylist,
  SpotifySearchResponse,
  SpotifyPlaylistResponse,
} from './spotify.types';

@Injectable()
export class SpotifyService {
  private readonly logger = new Logger(SpotifyService.name);

  constructor(private readonly httpService: HttpService) {}

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

  searchTrack = async (accessToken: string, title: string, artist: string): Promise<string | null> => {
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
    return items[0].uri;
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
}
