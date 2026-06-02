import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SpotifyService } from './spotify.service';

@Controller('internal/spotify')
export class InternalSpotifyController {
  constructor(private readonly spotifyService: SpotifyService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateTrack(@Body() body: { title: string; artist: string }) {
    const appToken = await this.spotifyService.getAppToken();
    const uri = await this.spotifyService.searchTrack(appToken, body.title, body.artist);
    return { is_valid: !!uri };
  }
}
