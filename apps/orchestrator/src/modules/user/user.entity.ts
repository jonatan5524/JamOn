import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn
} from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ unique: true })
    spotifyId!: string;

    @Column()
    email!: string;

    @Column({ nullable: true })
    displayName?: string;

    @Column({ nullable: true })
    profileImage?: string;

    @Column({ type: 'varchar', nullable: true, select: false })
    spotifyRefreshToken?: string | null;

    @Column({ type: 'varchar', nullable: true, select: false })
    spotifyAccessToken?: string | null;

    @Column({ type: 'varchar', nullable: true, select: false })
    spotifyClientKey?: string | null;

    @Column({type: 'text', nullable: true, select: false })
    appRefreshToken?: string | null;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @Column({ type: 'timestamptz', name: 'last_updated_songs', nullable: true })
    lastUpdatedSongs!: Date | null;
}