import { Test, TestingModule } from '@nestjs/testing';
import { DataEngineService } from '../src/modules/data-engine/data-engine.service';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { HttpStatus, HttpException } from '@nestjs/common';
import { PlaylistError } from '../src/modules/playlist/dto/playlist-response.dto';

describe('DataEngineService (Resilience)', () => {
  let service: DataEngineService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataEngineService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataEngineService>(DataEngineService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should throw AI_SERVICE_BUSY when data-engine returns 429', async () => {
    const errorResponse = {
      response: {
        status: HttpStatus.TOO_MANY_REQUESTS,
        data: { detail: 'Gemini API Rate Limit Exceeded' },
      },
    };

    jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => errorResponse));

    try {
      await service.getRecommendations('test', []);
      fail('Should have thrown an error');
    } catch (e: any) {
      expect(e).toBeInstanceOf(HttpException);
      expect(e.getResponse().error).toBe(PlaylistError.AI_SERVICE_BUSY);
      expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('should throw AI_SERVICE_BUSY when data-engine returns 503 (Circuit OPEN)', async () => {
    const errorResponse = {
      response: {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        data: { detail: 'AI Service currently unavailable (Circuit Breaker OPEN)' },
      },
    };

    jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => errorResponse));

    try {
      await service.getRecommendations('test', []);
      fail('Should have thrown an error');
    } catch (e: any) {
      expect(e).toBeInstanceOf(HttpException);
      expect(e.getResponse().error).toBe(PlaylistError.AI_SERVICE_BUSY);
      expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS); // We map 503 from internal to 429 for client if AI busy
    }
  });
});
