import { Entity, PrimaryColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Event } from './event.entity';
import { User } from '../user/user.entity';

@Entity('event_participants')
export class EventParticipant {
    @PrimaryColumn({ type: 'bigint', name: 'event_id' })
    eventId!: string;

    @PrimaryColumn({ type: 'uuid', name: 'user_id' })
    userId!: string;

    @ManyToOne(() => Event, (event) => event.participants, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'event_id' })
    event!: Event;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user!: User;

    @CreateDateColumn({ type: 'timestamptz', name: 'joined_at' })
    joinedAt!: Date;
}
