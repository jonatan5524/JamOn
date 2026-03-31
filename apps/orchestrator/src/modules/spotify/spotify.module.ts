import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SpotifyService } from './spotify.service';

const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1"

@Module({
  imports: [
    HttpModule.register({
      baseURL: SPOTIFY_API_BASE_URL,
    }),
  ],
  providers: [SpotifyService],
  exports: [SpotifyService],
})
export class SpotifyModule {}
