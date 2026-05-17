import { Module } from "@nestjs/common";
import { EventsService } from "./event.service";
import { EventsController } from "./event.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Event } from "./event.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Event])],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventModule { }