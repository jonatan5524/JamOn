import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SpotifyService } from './spotify.service';
import { InternalSpotifyController } from './spotify.controller';

const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1"

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      baseURL: SPOTIFY_API_BASE_URL,
    }),
  ],
  controllers: [InternalSpotifyController],
  providers: [SpotifyService],
  exports: [SpotifyService],
})
export class SpotifyModule {}
