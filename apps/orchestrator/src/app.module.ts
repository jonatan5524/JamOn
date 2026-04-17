import { Module } from "@nestjs/common";
import { SpotifyModule } from "./modules/spotify/spotify.module";
import { PlaylistModule } from "./modules/playlist/playlist.module";
import { AuthModule } from "./modules/auth/auth.module";

@Module({
  imports: [SpotifyModule, PlaylistModule, AuthModule],
})
export class AppModule {}
