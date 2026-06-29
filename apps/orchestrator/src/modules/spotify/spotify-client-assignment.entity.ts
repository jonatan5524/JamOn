import { Entity, PrimaryColumn, Column, CreateDateColumn } from "typeorm";

@Entity("spotify_client_assignments")
export class SpotifyClientAssignment {
  @PrimaryColumn()
  email!: string; // always stored lowercased

  @Column()
  clientKey!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
