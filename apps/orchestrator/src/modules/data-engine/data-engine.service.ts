import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SimplifiedTrack } from '../spotify/spotify.types';

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

    const { data } = await firstValueFrom(
      this.httpService.post<RecommendedSong[]>('/recommend', {
        event_description: eventDescription,
        songs: topTracks
      }),
    );

    this.logger.log(`Received ${data.length} recommendations`);
    return data;
  };
}
