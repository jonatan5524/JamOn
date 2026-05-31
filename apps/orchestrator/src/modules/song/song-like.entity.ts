import {
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    Unique,
    Column,
} from 'typeorm';
import { User } from '../user/user.entity';
import { Song } from './song.entity';

@Entity('song_likes')
@Unique(['userId', 'songId'])
export class SongLike {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'user_id' })
    userId!: string;

    @Column({ type: 'uuid', name: 'song_id' })
    songId!: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user!: User;

    @ManyToOne(() => Song, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'song_id' })
    song!: Song;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;
}
