import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { CreateEventDto } from "./dto/create-event.dto";
import { Event } from "./event.entity";
import { EventParticipant } from "./event-participant.entity";
import { generateEventCode } from "./event-code.util";

const MAX_CODE_RETRIES = 5;
const PG_UNIQUE_VIOLATION = "23505";

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(EventParticipant)
    private readonly participantRepository: Repository<EventParticipant>,
  ) {}

  async create(createEventDto: CreateEventDto, userId: string): Promise<Event> {
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      const newEvent = this.eventRepository.create({
        title: createEventDto.title,
        context: createEventDto.context,
        code: generateEventCode(),
        creator: { id: userId } as any,
      });

      try {
        const saved = await this.eventRepository.save(newEvent);
        const participant = this.participantRepository.create({
          eventId: saved.id,
          userId,
        });
        await this.participantRepository.save(participant);
        return saved;
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          (err as any).code === PG_UNIQUE_VIOLATION
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new InternalServerErrorException(
      "Failed to generate unique event code",
    );
  }

  async findById(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ["participants", "participants.user", "creator"],
    });
    if (!event) {
      throw new NotFoundException(`Event ${id} not found`);
    }
    return event;
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

  async savePlaylistResult(
    eventId: string,
    playlistId: string,
    playlistUrl: string,
    tracksAdded: number,
  ): Promise<void> {
    await this.eventRepository.update(eventId, {
      playlistId,
      playlistUrl,
      tracksAdded,
    });
  }

  async joinEvent(eventId: string, userId: string): Promise<EventParticipant> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
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
      if (
        err instanceof QueryFailedError &&
        (err as any).code === PG_UNIQUE_VIOLATION
      ) {
        return this.participantRepository.findOneOrFail({
          where: { eventId, userId },
        });
      }
      throw err;
    }
  }
}
