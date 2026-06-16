import { Module, forwardRef } from "@nestjs/common";
import { SpotifyModule } from "../spotify/spotify.module";
import { DataEngineModule } from "../data-engine/data-engine.module";
import { EventModule } from "../event/event.module";
import { SongModule } from "../song/song.module";
import { PlaylistController } from "./playlist.controller";
import { PlaylistService } from "./playlist.service";
import { UserModule } from "../user/user.module";

@Module({
  imports: [SpotifyModule, DataEngineModule, forwardRef(() => EventModule), UserModule, SongModule],
  controllers: [PlaylistController],
  providers: [PlaylistService],
  exports: [PlaylistService],
})
export class PlaylistModule {}
