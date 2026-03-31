import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DataEngineService } from './data-engine.service';

const DATA_ENGINE_BASE_URL = process.env.DATA_ENGINE_URL || 'http://localhost:8000';

@Module({
  imports: [
    HttpModule.register({
      baseURL: DATA_ENGINE_BASE_URL,
    }),
  ],
  providers: [DataEngineService],
  exports: [DataEngineService],
})
export class DataEngineModule {}
