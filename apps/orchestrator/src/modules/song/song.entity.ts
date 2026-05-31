import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('songs')
export class Song {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'text' })
    name!: string;

    @Column({ type: 'text', name: 'artist_name' })
    artistName!: string;

    @Column({ type: 'vector', nullable: true })
    embedding!: string | null;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;
}
