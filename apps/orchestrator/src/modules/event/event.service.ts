import { ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { CreateEventDto } from "./dto/create-event.dto";
import { Event } from "./event.entity";
import { EventParticipant } from "./event-participant.entity";
import { generateEventCode } from "./event-code.util";
import { EventRoleType } from "./event-role.decorator";

const MAX_CODE_RETRIES = 5;
const PG_UNIQUE_VIOLATION = '23505';

export type EventWithRole = Event & { viewerRole: EventRoleType };

@Injectable()
export class EventsService {
    constructor(
        @InjectRepository(Event)
        private readonly eventRepository: Repository<Event>,
        @InjectRepository(EventParticipant)
        private readonly participantRepository: Repository<EventParticipant>,
    ) { }

    async create(createEventDto: CreateEventDto, userId: string): Promise<Event> {
        for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
            try {
                return await this.eventRepository.manager.transaction(async (manager) => {
                    const newEvent = manager.create(Event, {
                        title: createEventDto.title,
                        context: createEventDto.context,
                        code: generateEventCode(),
                        creator: { id: userId } as any,
                    });
                    const saved = await manager.save(newEvent);

                    const participant = manager.create(EventParticipant, {
                        eventId: saved.id,
                        userId,
                    });
                    await manager.save(participant);

                    return saved;
                });
            } catch (err) {
                if (err instanceof QueryFailedError && (err as any).code === PG_UNIQUE_VIOLATION) {
                    continue;
                }
                throw err;
            }
        }
        throw new InternalServerErrorException('Failed to generate unique event code');
    }

    private roleFor(event: Event, userId: string): EventRoleType | null {
        if (event.creator?.id === userId) return 'creator';
        if (event.participants?.some((p) => p.userId === userId)) return 'participant';
        return null;
    }

    async findById(id: string, userId: string): Promise<EventWithRole> {
        const event = await this.eventRepository.findOne({
            where: { id },
            relations: ['participants', 'participants.user', 'creator'],
        });
        if (!event) {
            throw new NotFoundException(`Event ${id} not found`);
        }

        const role = this.roleFor(event, userId);
        if (!role) {
            throw new ForbiddenException('You are not a member of this event');
        }

        return Object.assign(event, { viewerRole: role });
    }

    // Lightweight role lookup for EventRoleGuard (no participant.user join).
    async getViewerRole(id: string, userId: string): Promise<EventRoleType> {
        const event = await this.eventRepository.findOne({
            where: { id },
            relations: ['participants', 'creator'],
        });
        if (!event) {
            throw new NotFoundException(`Event ${id} not found`);
        }

        const role = this.roleFor(event, userId);
        if (!role) {
            throw new ForbiddenException('You are not a member of this event');
        }

        return role;
    }

    async findByCode(code: string): Promise<Event> {
        const event = await this.eventRepository.findOne({
            where: { code: code.toUpperCase() },
        });
        if (!event) {
            throw new NotFoundException(`Event with code ${code} not found`);
        }
        return event;
    }

    async joinEvent(eventId: string, userId: string): Promise<EventParticipant> {
        const event = await this.eventRepository.findOne({ where: { id: eventId } });
        if (!event) {
            throw new NotFoundException(`Event ${eventId} not found`);
        }

        const existing = await this.participantRepository.findOne({
            where: { eventId, userId },
        });
        if (existing) {
            return existing;
        }

        const participant = this.participantRepository.create({ eventId, userId });
        try {
            return await this.participantRepository.save(participant);
        } catch (err) {
            if (err instanceof QueryFailedError && (err as any).code === PG_UNIQUE_VIOLATION) {
                return this.participantRepository.findOneOrFail({ where: { eventId, userId } });
            }
            throw err;
        }
    }
}