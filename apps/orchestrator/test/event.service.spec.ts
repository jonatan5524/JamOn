import { Test } from "@nestjs/testing";
import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventsService } from "../src/modules/event/event.service";
import { Event } from "../src/modules/event/event.entity";
import { EventParticipant } from "../src/modules/event/event-participant.entity";
import { EventPlaylistTrack } from "../src/modules/event/event-playlist-track.entity";
import { SongLike } from "../src/modules/song/song-like.entity";

const uniqueViolation = () => {
  const err = new QueryFailedError("insert", [], new Error("dup") as any);
  (err as any).code = "23505";
  return err;
};

describe("EventsService", () => {
  let service: EventsService;
  let eventRepository: any;
  let participantRepository: any;
  let playlistTrackRepository: any;

  beforeEach(async () => {
    eventRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      manager: { transaction: jest.fn() },
    };
    participantRepository = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
    };
    playlistTrackRepository = { find: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: eventRepository },
        {
          provide: getRepositoryToken(EventParticipant),
          useValue: participantRepository,
        },
        {
          provide: getRepositoryToken(EventPlaylistTrack),
          useValue: playlistTrackRepository,
        },
        { provide: getRepositoryToken(SongLike), useValue: {} },
      ],
    }).compile();

    service = module.get(EventsService);
  });

  describe("findByCode", () => {
    it("uppercases the code and returns the event", async () => {
      const event = { id: "e1", code: "ABC123" };
      eventRepository.findOne.mockResolvedValue(event);

      const result = await service.findByCode("abc123");

      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { code: "ABC123" },
      });
      expect(result).toBe(event);
    });

    it("throws NotFoundException for an unknown code", async () => {
      eventRepository.findOne.mockResolvedValue(null);
      await expect(service.findByCode("ZZZZZZ")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("findById", () => {
    it('returns the event with viewerRole "creator"', async () => {
      eventRepository.findOne.mockResolvedValue({
        id: "e1",
        creator: { id: "user-1" },
        participants: [],
        playlistId: null,
      });

      const result = await service.findById("e1", "user-1");

      expect(result.viewerRole).toBe("creator");
      expect(result.playlistTracks).toEqual([]);
    });

    it('returns viewerRole "participant" for a member', async () => {
      eventRepository.findOne.mockResolvedValue({
        id: "e1",
        creator: { id: "other" },
        participants: [{ userId: "user-1" }],
        playlistId: null,
      });

      const result = await service.findById("e1", "user-1");
      expect(result.viewerRole).toBe("participant");
    });

    it("throws NotFoundException when the event is missing", async () => {
      eventRepository.findOne.mockResolvedValue(null);
      await expect(service.findById("e1", "user-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws ForbiddenException when the user is not a member", async () => {
      eventRepository.findOne.mockResolvedValue({
        id: "e1",
        creator: { id: "other" },
        participants: [{ userId: "someone-else" }],
        playlistId: null,
      });
      await expect(service.findById("e1", "user-1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("maps stored playlist tracks to summaries", async () => {
      eventRepository.findOne.mockResolvedValue({
        id: "e1",
        creator: { id: "user-1" },
        participants: [],
        playlistId: "pl1",
      });
      playlistTrackRepository.find.mockResolvedValue([
        {
          songId: "s1",
          position: 1,
          song: {
            name: "Song A",
            artistName: "Artist A",
            spotifyUri: "spotify:track:abc",
          },
        },
      ]);

      const result = await service.findById("e1", "user-1");

      expect(result.playlistTracks).toEqual([
        {
          id: "s1",
          position: 1,
          title: "Song A",
          artist: "Artist A",
          spotifyUrl: "https://open.spotify.com/track/abc",
        },
      ]);
    });
  });

  describe("getViewerRole", () => {
    it("returns the role for a member", async () => {
      eventRepository.findOne.mockResolvedValue({
        id: "e1",
        creator: { id: "user-1" },
        participants: [],
      });
      expect(await service.getViewerRole("e1", "user-1")).toBe("creator");
    });

    it("throws ForbiddenException for a non-member", async () => {
      eventRepository.findOne.mockResolvedValue({
        id: "e1",
        creator: { id: "other" },
        participants: [],
      });
      await expect(
        service.getViewerRole("e1", "user-1"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("joinEvent", () => {
    it("returns the existing participant when already joined", async () => {
      eventRepository.findOne.mockResolvedValue({ id: "e1" });
      const existing = { eventId: "e1", userId: "user-1" };
      participantRepository.findOne.mockResolvedValue(existing);

      const result = await service.joinEvent("e1", "user-1");

      expect(result).toBe(existing);
      expect(participantRepository.save).not.toHaveBeenCalled();
    });

    it("creates a new participant when not joined", async () => {
      eventRepository.findOne.mockResolvedValue({ id: "e1" });
      participantRepository.findOne.mockResolvedValue(null);
      const saved = { eventId: "e1", userId: "user-1" };
      participantRepository.save.mockResolvedValue(saved);

      const result = await service.joinEvent("e1", "user-1");

      expect(result).toBe(saved);
    });

    it("recovers from a unique-violation race by fetching the existing row", async () => {
      eventRepository.findOne.mockResolvedValue({ id: "e1" });
      participantRepository.findOne.mockResolvedValue(null);
      participantRepository.save.mockRejectedValue(uniqueViolation());
      const existing = { eventId: "e1", userId: "user-1" };
      participantRepository.findOneOrFail.mockResolvedValue(existing);

      const result = await service.joinEvent("e1", "user-1");

      expect(result).toBe(existing);
    });

    it("throws NotFoundException when the event does not exist", async () => {
      eventRepository.findOne.mockResolvedValue(null);
      await expect(service.joinEvent("e1", "user-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("findByUserId", () => {
    it("returns events where the user participates or is the creator", async () => {
      const events = [{ id: "e1" }, { id: "e2" }];
      eventRepository.find.mockResolvedValue(events);

      const result = await service.findByUserId("user-1");

      expect(result).toBe(events);
      expect(eventRepository.find).toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("commits the event and creator participant in one transaction", async () => {
      const saved = { id: "e1" };
      const manager = {
        create: jest.fn((_entity, data) => data),
        save: jest.fn().mockResolvedValueOnce(saved).mockResolvedValueOnce({}),
      };
      eventRepository.manager.transaction.mockImplementation(async (cb: any) =>
        cb(manager),
      );

      const result = await service.create(
        { title: "Party", context: "Fun" } as any,
        "user-1",
      );

      expect(result).toBe(saved);
      expect(manager.save).toHaveBeenCalledTimes(2);
    });

    it("retries on a code collision then succeeds", async () => {
      const saved = { id: "e1" };
      eventRepository.manager.transaction
        .mockRejectedValueOnce(uniqueViolation())
        .mockImplementationOnce(async (cb: any) =>
          cb({
            create: jest.fn((_e, data) => data),
            save: jest.fn().mockResolvedValue(saved),
          }),
        );

      const result = await service.create(
        { title: "P", context: "C" } as any,
        "user-1",
      );
      expect(result).toBe(saved);
    });

    it("throws InternalServerErrorException after exhausting code retries", async () => {
      eventRepository.manager.transaction.mockRejectedValue(uniqueViolation());

      await expect(
        service.create({ title: "P", context: "C" } as any, "user-1"),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it("rethrows non-unique-violation errors immediately", async () => {
      eventRepository.manager.transaction.mockRejectedValue(
        new Error("db down"),
      );

      await expect(
        service.create({ title: "P", context: "C" } as any, "user-1"),
      ).rejects.toThrow("db down");
    });
  });

  describe("savePlaylistResult", () => {
    it("persists the playlist and inserts tracks, then recalculates statistics", async () => {
      const manager = {
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        insert: jest.fn().mockResolvedValue({}),
      };
      eventRepository.manager.transaction.mockImplementation(async (cb: any) =>
        cb(manager),
      );
      const recalcSpy = jest
        .spyOn(service, "recalculateStatistics")
        .mockResolvedValue(undefined);

      await service.savePlaylistResult("e1", "pl1", "url", 2, [
        { songId: "s1", position: 1 } as any,
      ]);

      expect(manager.update).toHaveBeenCalled();
      expect(manager.delete).toHaveBeenCalled();
      expect(manager.insert).toHaveBeenCalled();
      expect(recalcSpy).toHaveBeenCalledWith("e1");
    });

    it("skips statistics recalculation when requested", async () => {
      const manager = {
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        insert: jest.fn().mockResolvedValue({}),
      };
      eventRepository.manager.transaction.mockImplementation(async (cb: any) =>
        cb(manager),
      );
      const recalcSpy = jest
        .spyOn(service, "recalculateStatistics")
        .mockResolvedValue(undefined);

      await service.savePlaylistResult("e1", "pl1", "url", 0, [], true);

      expect(manager.insert).not.toHaveBeenCalled();
      expect(recalcSpy).not.toHaveBeenCalled();
    });
  });
});
