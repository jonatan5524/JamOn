import { Module } from '@nestjs/common';
import { SpotifyModule } from './modules/spotify/spotify.module';
import { PlaylistModule } from './modules/playlist/playlist.module';

@Module({
  imports: [SpotifyModule, PlaylistModule],
})
export class AppModule {}
