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

    @Column({ nullable: true, select: false })
    spotifyRefreshToken?: string;

    @Column({ nullable: true, select: false })
    spotifyAccessToken?: string;

    @Column({type: 'text', nullable: true, select: false })
    appRefreshToken?: string | null;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}