import { Module, forwardRef } from "@nestjs/common";
import { EventsService } from "./event.service";
import { EventsController } from "./event.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Event } from "./event.entity";
import { EventParticipant } from "./event-participant.entity";
import { EventPlaylistTrack } from "./event-playlist-track.entity";
import { EventRoleGuard } from "./event-role.guard";
import { PlaylistModule } from "../playlist/playlist.module";
import { UserModule } from "../user/user.module";
import { SongLike } from "../song/song-like.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventParticipant, EventPlaylistTrack, SongLike]),
    forwardRef(() => PlaylistModule),
    UserModule,
  ],
  controllers: [EventsController],
  providers: [EventsService, EventRoleGuard],
  exports: [EventsService],
})
export class EventModule {}
