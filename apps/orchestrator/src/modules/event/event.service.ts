import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateEventDto } from "./dto/create-event.dto";
import { Event } from "./event.entity";

@Injectable()
export class EventsService {
    constructor(
        @InjectRepository(Event)
        private readonly eventRepository: Repository<Event>,
    ) { }

    async create(createEventDto: CreateEventDto, userId: string): Promise<Event> {
        const newEvent = this.eventRepository.create({
            title: createEventDto.title,
            context: createEventDto.context,
            creator: { id: userId } as any,
        });

        return this.eventRepository.save(newEvent);
    }
}