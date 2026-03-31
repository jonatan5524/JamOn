import { Module } from '@nestjs/common';
import { DataEngineService } from './data-engine.service';

@Module({
  providers: [DataEngineService],
  exports: [DataEngineService],
})
export class DataEngineModule {}
