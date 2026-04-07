import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SimplifiedTrack } from '../spotify/spotify.types';
import { PlaylistError } from '../playlist/dto/playlist-response.dto';

export interface RecommendedSong {
  title: string;
  artist: string;
  is_new: boolean;
}

@Injectable()
export class DataEngineService {
  private readonly logger = new Logger(DataEngineService.name);

  constructor(private readonly httpService: HttpService) {}

  getRecommendations = async (eventDescription: string, topTracks: SimplifiedTrack[]): Promise<RecommendedSong[]> => {
    this.logger.log(`Requesting recommendations for: "${eventDescription}"`);

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<RecommendedSong[]>('/recommend', {
          event_description: eventDescription,
          songs: topTracks
        }),
      );

      this.logger.log(`Received ${data.length} recommendations`);
      return data;
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        if (status === 429 || status === 503 || status === 502) {
          this.logger.warn(`AI service busy or unavailable: ${status}`);
          throw new HttpException(
            {
              error: PlaylistError.AI_SERVICE_BUSY,
              message: 'The AI engine is currently at capacity or unavailable. Please try again in a minute.',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
      this.logger.error('Error calling data-engine:', error.message);
      throw error;
    }
  };
}
