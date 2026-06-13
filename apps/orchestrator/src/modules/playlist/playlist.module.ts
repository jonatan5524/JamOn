import { Module } from "@nestjs/common";
import { SpotifyModule } from "../spotify/spotify.module";
import { DataEngineModule } from "../data-engine/data-engine.module";
import { SongModule } from "../song/song.module";
import { PlaylistController } from "./playlist.controller";
import { PlaylistService } from "./playlist.service";

@Module({
  imports: [SpotifyModule, DataEngineModule, SongModule],
  controllers: [PlaylistController],
  providers: [PlaylistService],
  exports: [PlaylistService],
})
export class PlaylistModule {}
