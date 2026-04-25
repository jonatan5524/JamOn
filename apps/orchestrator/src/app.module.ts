import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SpotifyModule } from "./modules/spotify/spotify.module";
import { PlaylistModule } from "./modules/playlist/playlist.module";
import { AuthModule } from "./modules/auth/auth.module";
import { EventModule } from "./modules/event/event.module";
import { UserModule } from "./modules/user/user.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    SpotifyModule,
    PlaylistModule,
    AuthModule,
    EventModule,
    UserModule
  ],
})
export class AppModule {}
