import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { of, throwError } from "rxjs";
import { DataEngineService } from "../src/modules/data-engine/data-engine.service";

describe("DataEngineService", () => {
  let service: DataEngineService;
  let httpService: { post: jest.Mock };

  beforeEach(async () => {
    httpService = { post: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataEngineService,
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    module.useLogger(false);
    service = module.get(DataEngineService);
  });

  describe("getRecommendations", () => {
    it("posts the eventId and returns the recommendations", async () => {
      const recommendations = [
        { title: "Song A", artist: "Artist A", is_new: false },
        { title: "Song B", artist: "Artist B", is_new: true },
      ];
      httpService.post.mockReturnValue(of({ data: recommendations }));

      const result = await service.getRecommendations("event-1");

      expect(httpService.post).toHaveBeenCalledWith("/recommend", {
        event_id: "event-1",
      });
      expect(result).toEqual(recommendations);
    });

    it("rethrows non-capacity errors unchanged", async () => {
      const error = { response: { status: 500 }, message: "boom" };
      httpService.post.mockReturnValue(throwError(() => error));

      await expect(service.getRecommendations("event-1")).rejects.toBe(error);
    });
  });

  describe("ingestBatch", () => {
    it("normalizes snake_case artist_name to camelCase DTOs", async () => {
      httpService.post.mockReturnValue(
        of({
          data: [
            { name: "Song A", artist_name: "Artist A", embedding: [0.1] },
            { name: "Song B", artistName: "Artist B", embedding: [0.2] },
          ],
        }),
      );

      const result = await service.ingestBatch([
        { title: "Song A", artist: "Artist A" },
        { title: "Song B", artist: "Artist B" },
      ] as any);

      expect(httpService.post).toHaveBeenCalledWith(
        "/ingest-batch",
        expect.any(Array),
      );
      expect(result).toEqual([
        { name: "Song A", artistName: "Artist A", embedding: [0.1] },
        { name: "Song B", artistName: "Artist B", embedding: [0.2] },
      ]);
    });

    it("propagates errors from the data-engine", async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error("unreachable")),
      );

      await expect(
        service.ingestBatch([{ title: "A", artist: "B" }] as any),
      ).rejects.toThrow("unreachable");
    });
  });
});
