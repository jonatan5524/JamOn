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

    @Column({ type: 'jsonb', name: 'vibe_tags', nullable: true })
    vibeTags!: string[] | null;

    @Column({ type: 'text', name: 'energy_desc', nullable: true })
    energyDesc!: string | null;

    @Column({ type: 'text', name: 'mood_desc', nullable: true })
    moodDesc!: string | null;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;
}
