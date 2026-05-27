import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SpotifyService } from './spotify.service';
import { InternalSpotifyController } from './spotify.controller';

const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1"

@Module({
  imports: [
    HttpModule.register({
      baseURL: SPOTIFY_API_BASE_URL,
    }),
  ],
  controllers: [InternalSpotifyController],
  providers: [SpotifyService],
  exports: [SpotifyService],
})
export class SpotifyModule {}
