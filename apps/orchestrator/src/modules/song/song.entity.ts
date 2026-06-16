import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('songs')
@Unique(['name', 'artistName'])
export class Song {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'text' })
    name!: string;

    @Column({ type: 'text', name: 'artist_name' })
    artistName!: string;

    @Column({ type: 'text', name: 'spotify_uri', nullable: true })
    spotifyUri!: string | null;

    @Column({ type: 'vector', nullable: true })
    embedding!: string | null;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;
}
