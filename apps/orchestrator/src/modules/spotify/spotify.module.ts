import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpotifyService } from './spotify.service';
import { InternalSpotifyController } from './spotify.controller';
import { SpotifyClientRegistry } from './spotify-client.registry';
import { SpotifyClientAssignment } from './spotify-client-assignment.entity';
import { SpotifyClientResolver } from './spotify-client.resolver';
import { SpotifyClientMiddleware } from './spotify-client.middleware';

const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1"

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      baseURL: SPOTIFY_API_BASE_URL,
    }),
    TypeOrmModule.forFeature([SpotifyClientAssignment]),
  ],
  controllers: [InternalSpotifyController],
  providers: [SpotifyService, SpotifyClientRegistry, SpotifyClientResolver, SpotifyClientMiddleware],
  exports: [SpotifyService, SpotifyClientRegistry, SpotifyClientResolver, SpotifyClientMiddleware],
})
export class SpotifyModule {}
