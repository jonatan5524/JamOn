import { Module } from '@nestjs/common';
import { SpotifyModule } from '../spotify/spotify.module';
import { DataEngineModule } from '../data-engine/data-engine.module';
import { PlaylistController } from './playlist.controller';
import { PlaylistService } from './playlist.service';

@Module({
  imports: [SpotifyModule, DataEngineModule],
  controllers: [PlaylistController],
  providers: [PlaylistService],
})
export class PlaylistModule {}
