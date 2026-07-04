import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { EventsController } from "../src/modules/event/event.controller";
import { EventsService } from "../src/modules/event/event.service";
import { PlaylistService } from "../src/modules/playlist/playlist.service";
import { UserService } from "../src/modules/user/user.service";
import { EventRoleGuard } from "../src/modules/event/event-role.guard";
import { AuthGuard } from "@nestjs/passport";

describe("EventsController", () => {
  let controller: EventsController;
  let eventsService: jest.Mocked<EventsService>;
  let playlistService: jest.Mocked<PlaylistService>;

  const USER_ID = "user-1";
  const req = { user: { userId: USER_ID } };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: {
            create: jest.fn(),
            findByCode: jest.fn(),
            findByUserId: jest.fn(),
            joinEvent: jest.fn(),
            findById: jest.fn(),
            savePlaylistResult: jest.fn(),
            recalculateStatistics: jest.fn(),
          },
        },
        {
          provide: PlaylistService,
          useValue: {
            generatePlaylist: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            findByIdWithSpotifyToken: jest.fn(),
          },
        },
      ],
    })
      // Guards depend on Passport / DB — override them for unit testing
      .overrideGuard(AuthGuard("jwt"))
      .useValue({ canActivate: () => true })
      .overrideGuard(EventRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    module.useLogger(false);

    controller = module.get(EventsController);
    eventsService = module.get(EventsService);
    playlistService = module.get(PlaylistService);
  });

  describe("createEvent", () => {
    it("delegates to eventsService.create with the authenticated userId", async () => {
      const dto = { title: "Party", context: "Birthday bash" } as any;
      const created = { id: "e1", ...dto };
      eventsService.create.mockResolvedValue(created as any);

      const result = await controller.createEvent(dto, req);

      expect(eventsService.create).toHaveBeenCalledWith(dto, USER_ID);
      expect(result).toBe(created);
    });

    it("throws UnauthorizedException when userId is missing", async () => {
      await expect(
        controller.createEvent({} as any, { user: {} }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("findByCode", () => {
    it("returns the event for a given code", async () => {
      const event = { id: "e1", code: "ABC123" };
      eventsService.findByCode.mockResolvedValue(event as any);

      const result = await controller.findByCode("ABC123");

      expect(eventsService.findByCode).toHaveBeenCalledWith("ABC123");
      expect(result).toBe(event);
    });
  });

  describe("getMyEvents", () => {
    it("returns events for the authenticated user", async () => {
      const events = [{ id: "e1" }, { id: "e2" }];
      eventsService.findByUserId.mockResolvedValue(events as any);

      const result = await controller.getMyEvents(req);

      expect(eventsService.findByUserId).toHaveBeenCalledWith(USER_ID);
      expect(result).toBe(events);
    });
  });

  describe("joinEvent", () => {
    it("links the user to the event", async () => {
      const participant = { eventId: "e1", userId: USER_ID };
      eventsService.joinEvent.mockResolvedValue(participant as any);

      const result = await controller.joinEvent("e1", req);

      expect(eventsService.joinEvent).toHaveBeenCalledWith("e1", USER_ID);
      expect(result).toBe(participant);
    });

    it("throws UnauthorizedException when userId is missing", async () => {
      await expect(
        controller.joinEvent("e1", { user: {} }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("getEventDetails", () => {
    it("returns event detail scoped to the user", async () => {
      const detail = { id: "e1", role: "creator" };
      eventsService.findById.mockResolvedValue(detail as any);

      const result = await controller.getEventDetails("e1", req);

      expect(eventsService.findById).toHaveBeenCalledWith("e1", USER_ID);
      expect(result).toBe(detail);
    });

    it("throws UnauthorizedException when userId is missing", async () => {
      await expect(
        controller.getEventDetails("e1", { user: {} }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("generatePlaylist", () => {
    const playlistResult = {
      playlistId: "pl1",
      playlistUrl: "https://open.spotify.com/playlist/pl1",
      tracksAdded: 18,
      tracksNotFound: ["Song X by Artist Y"],
      totalRequested: 20,
      tracks: [{ songId: "s1" }],
      hasPendingEmbeddings: true,
    };

    it("generates the playlist and persists the result", async () => {
      playlistService.generatePlaylist.mockResolvedValue(playlistResult as any);
      eventsService.savePlaylistResult.mockResolvedValue(undefined as any);

      const result = await controller.generatePlaylist("e1", req);

      expect(playlistService.generatePlaylist).toHaveBeenCalledWith(
        "e1",
        USER_ID,
      );
      expect(eventsService.savePlaylistResult).toHaveBeenCalledWith(
        "e1",
        playlistResult.playlistId,
        playlistResult.playlistUrl,
        playlistResult.tracksAdded,
        playlistResult.tracks,
        playlistResult.hasPendingEmbeddings,
      );
      expect(result).toBe(playlistResult);
    });

    it("throws UnauthorizedException when userId is missing", async () => {
      await expect(
        controller.generatePlaylist("e1", { user: {} }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(playlistService.generatePlaylist).not.toHaveBeenCalled();
    });

    it("propagates errors thrown by the playlist service", async () => {
      playlistService.generatePlaylist.mockRejectedValue(new Error("boom"));

      await expect(controller.generatePlaylist("e1", req)).rejects.toThrow(
        "boom",
      );
      expect(eventsService.savePlaylistResult).not.toHaveBeenCalled();
    });
  });
});
