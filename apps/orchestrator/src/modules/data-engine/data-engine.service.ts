import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface RecommendedSong {
  title: string;
  artist: string;
  is_new: boolean;
}

@Injectable()
export class DataEngineService {
  private readonly logger = new Logger(DataEngineService.name);

  constructor(private readonly httpService: HttpService) {}

  getRecommendations = async (eventDescription: string): Promise<RecommendedSong[]> => {
    this.logger.log(`Requesting recommendations for: "${eventDescription}"`);

    const { data } = await firstValueFrom(
      this.httpService.post<RecommendedSong[]>('/recommend', {
        event_description: eventDescription,
      }),
    );

    this.logger.log(`Received ${data.length} recommendations`);
    return data;
  };
}
