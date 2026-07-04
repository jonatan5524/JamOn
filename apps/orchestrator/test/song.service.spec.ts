import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { QueryFailedError, Repository } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SongService } from "../src/modules/song/song.service";
import { Song } from "../src/modules/song/song.entity";
import { SongLike } from "../src/modules/song/song-like.entity";

describe("SongService", () => {
  let service: SongService;
  let songRepository: jest.Mocked<Repository<Song>>;
  let songLikeRepository: jest.Mocked<Repository<SongLike>>;

  /** Builds a chainable QueryBuilder mock whose terminal `execute`/`getMany` resolve. */
  const makeQueryBuilder = (result: any = { raw: [] }) => {
    const qb: any = {};
    for (const method of [
      "insert",
      "into",
      "values",
      "orIgnore",
      "delete",
      "from",
      "where",
      "orWhere",
      "update",
      "set",
    ]) {
      qb[method] = jest.fn(() => qb);
    }
    qb.execute = jest.fn().mockResolvedValue(result);
    qb.getMany = jest.fn().mockResolvedValue(result);
    return qb;
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SongService,
        {
          provide: getRepositoryToken(Song),
          useValue: {
            create: jest.fn((x) => x),
            save: jest.fn(),
            update: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SongLike),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(SongService);
    songRepository = module.get(getRepositoryToken(Song));
    songLikeRepository = module.get(getRepositoryToken(SongLike));
  });

  describe("create", () => {
    it("creates and saves a new song", async () => {
      songRepository.findOne.mockResolvedValue(null);
      const saved = { id: "s1", name: "Song", artistName: "Artist" };
      songRepository.save.mockResolvedValue(saved as any);

      const result = await service.create({
        name: "Song",
        artistName: "Artist",
      } as any);

      expect(result).toBe(saved);
      expect(songRepository.save).toHaveBeenCalled();
    });

    it("serializes the embedding when provided", async () => {
      songRepository.findOne.mockResolvedValue(null);
      songRepository.save.mockImplementation(async (s: any) => s);

      await service.create({
        name: "Song",
        artistName: "Artist",
        embedding: [0.1, 0.2],
      } as any);

      expect(songRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ embedding: JSON.stringify([0.1, 0.2]) }),
      );
    });

    it("throws ConflictException when the song already exists", async () => {
      songRepository.findOne.mockResolvedValue({ id: "s1" } as any);

      await expect(
        service.create({ name: "Song", artistName: "Artist" } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("maps a unique-violation DB error to ConflictException", async () => {
      songRepository.findOne.mockResolvedValue(null);
      const dbError = new QueryFailedError(
        "insert",
        [],
        new Error("dup") as any,
      );
      (dbError as any).code = "23505";
      songRepository.save.mockRejectedValue(dbError);

      await expect(
        service.create({ name: "Song", artistName: "Artist" } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rethrows non-unique-violation errors", async () => {
      songRepository.findOne.mockResolvedValue(null);
      songRepository.save.mockRejectedValue(new Error("db down"));

      await expect(
        service.create({ name: "Song", artistName: "Artist" } as any),
      ).rejects.toThrow("db down");
    });
  });

  describe("findById", () => {
    it("returns the song when found", async () => {
      const song = { id: "s1" };
      songRepository.findOne.mockResolvedValue(song as any);

      expect(await service.findById("s1")).toBe(song);
    });

    it("throws NotFoundException when missing", async () => {
      songRepository.findOne.mockResolvedValue(null);

      await expect(service.findById("missing")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("updateEmbeddings", () => {
    it("is a no-op for an empty list", async () => {
      await service.updateEmbeddings([]);
      expect(songRepository.update).not.toHaveBeenCalled();
    });

    it("updates rows with a serialized embedding and skips undefined ones", async () => {
      songRepository.update.mockResolvedValue({} as any);

      await service.updateEmbeddings([
        { name: "A", artistName: "X", embedding: [1, 2] },
        { name: "B", artistName: "Y" },
      ] as any);

      expect(songRepository.update).toHaveBeenCalledTimes(1);
      expect(songRepository.update).toHaveBeenCalledWith(
        { name: "A", artistName: "X" },
        { embedding: JSON.stringify([1, 2]) },
      );
    });
  });

  describe("upsertSongsFromTracks", () => {
    it("returns an empty array for no tracks", async () => {
      expect(await service.upsertSongsFromTracks([])).toEqual([]);
    });

    it("inserts new songs and returns rows aligned to input order", async () => {
      const rows = [
        { id: "s1", name: "Song A", artistName: "Artist A" },
        { id: "s2", name: "Song B", artistName: "Artist B" },
      ];
      songRepository.createQueryBuilder
        .mockReturnValueOnce(makeQueryBuilder({}) as any) // insert
        .mockReturnValueOnce(makeQueryBuilder(rows) as any); // select getMany
      songRepository.update.mockResolvedValue({} as any);

      const result = await service.upsertSongsFromTracks([
        { title: "Song B", artist: "Artist B", spotifyUri: "spotify:track:b" },
        { title: "Song A", artist: "Artist A", spotifyUri: "spotify:track:a" },
      ] as any);

      // Result should follow input order (B then A)
      expect(result.map((s) => s.id)).toEqual(["s2", "s1"]);
    });
  });

  describe("bulkUpsertLikes", () => {
    it("is a no-op for an empty song list", async () => {
      await service.bulkUpsertLikes("user-1", []);
      expect(songLikeRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("deletes stale likes and inserts the new set", async () => {
      const deleteQb = makeQueryBuilder({});
      const insertQb = makeQueryBuilder({});
      songLikeRepository.createQueryBuilder
        .mockReturnValueOnce(deleteQb as any)
        .mockReturnValueOnce(insertQb as any);

      await service.bulkUpsertLikes("user-1", ["s1", "s2"]);

      expect(deleteQb.delete).toHaveBeenCalled();
      expect(insertQb.insert).toHaveBeenCalled();
      expect(insertQb.values).toHaveBeenCalledWith([
        { userId: "user-1", songId: "s1" },
        { userId: "user-1", songId: "s2" },
      ]);
    });
  });
});
