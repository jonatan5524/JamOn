import { Controller, Post, Body } from '@nestjs/common';
import { SpotifyService } from './spotify.service';

@Controller('internal/spotify')
export class InternalSpotifyController {
  constructor(private readonly spotifyService: SpotifyService) {}

  @Post('validate')
  async validateTrack(@Body() body: { title: string; artist: string }) {
    // Note: For this internal validation, we'll use a mock token or assume the service handles it.
    // In searchTrack(accessToken, title, artist), use 'MOCK_TOKEN' for now.
    const uri = await this.spotifyService.searchTrack('MOCK_TOKEN', body.title, body.artist);
    return { is_valid: !!uri };
  }
}
