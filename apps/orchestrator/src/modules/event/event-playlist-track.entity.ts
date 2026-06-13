import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Event } from "./event.entity";
import { Song } from "../song/song.entity";

@Entity("event_playlist_tracks")
@Unique(["eventId", "songId"])
@Unique(["eventId", "position"])
export class EventPlaylistTrack {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "bigint", name: "event_id" })
  eventId!: string;

  @Column({ type: "uuid", name: "song_id" })
  songId!: string;

  @Column({ type: "int" })
  position!: number;

  @ManyToOne(() => Event, (event) => event.playlistTracks, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "event_id" })
  event!: Event;

  @ManyToOne(() => Song, { onDelete: "CASCADE" })
  @JoinColumn({ name: "song_id" })
  song!: Song;
}
