import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';

@Entity('events')
export class Event {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: string;

    @Column({ type: 'text' })
    title!: string;

    @Column({ type: 'text', nullable: true })
    context!: string;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'created_by' })
    creator!: User;
}