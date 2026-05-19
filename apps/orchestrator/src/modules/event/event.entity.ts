import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, OneToMany } from 'typeorm';
import { User } from '../user/user.entity';
import { EventParticipant } from './event-participant.entity';

@Entity('events')
export class Event {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 6 })
    code!: string;

    @Column({ type: 'text' })
    title!: string;

    @Column({ type: 'text', nullable: true })
    context!: string;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'created_by' })
    creator!: User;

    @OneToMany(() => EventParticipant, (p) => p.event)
    participants!: EventParticipant[];
}