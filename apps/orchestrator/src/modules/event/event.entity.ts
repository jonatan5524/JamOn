import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from "typeorm";
import { User } from "../user/user.entity";
import { EventParticipant } from "./event-participant.entity";

@Entity("events")
export class Event {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 6 })
  code!: string;

  @Column({ type: "text" })
  title!: string;

  @Column({ type: "text", nullable: true })
  context!: string;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @Column({type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator!: User;

  @Column({ type: "varchar", nullable: true, name: "playlist_id" })
  playlistId?: string;

  @Column({ type: "text", nullable: true, name: "playlist_url" })
  playlistUrl?: string;

  @Column({ type: "int", nullable: true, name: "tracks_added" })
  tracksAdded?: number;

  @OneToMany(() => EventParticipant, (p) => p.event)
  participants!: EventParticipant[];
}
