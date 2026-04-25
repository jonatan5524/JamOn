import { Module } from "@nestjs/common";
import { EventsService } from "./event.service";
import { EventsController } from "./event.controller";

@Module({
  providers: [EventsService],
  controllers: [EventsController],
})
export class EventModule {}