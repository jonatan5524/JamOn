import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SpotifyModule } from "./modules/spotify/spotify.module";
import { PlaylistModule } from "./modules/playlist/playlist.module";
import { AuthModule } from "./modules/auth/auth.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    SpotifyModule,
    PlaylistModule,
    AuthModule,
  ],
})
export class AppModule {}
