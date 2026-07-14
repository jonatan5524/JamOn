import { Test } from "@nestjs/testing";
import { PlaylistService } from "../src/modules/playlist/playlist.service";
import { SpotifyService } from "../src/modules/spotify/spotify.service";
import { DataEngineService } from "../src/modules/data-engine/data-engine.service";
import { SongService } from "../src/modules/song/song.service";
import { UserService } from "../src/modules/user/user.service";
import { EventsService } from "../src/modules/event/event.service";

describe("PlaylistService", () => {
  let service: PlaylistService;
  let spotifyService: jest.Mocked<SpotifyService>;
  let dataEngineService: jest.Mocked<DataEngineService>;
  let songService: jest.Mocked<SongService>;
  let userService: jest.Mocked<UserService>;
  let eventsService: jest.Mocked<EventsService>;

  const EVENT_ID = "event-1";
  const USER_ID = "user-1";

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PlaylistService,
        {
          provide: SpotifyService,
          useValue: {
            getTopTracks: jest.fn(),
            searchTrackDetails: jest.fn(),
            createPlaylist: jest.fn(),
            addTracksToPlaylist: jest.fn(),
          },
        },
        {
          provide: DataEngineService,
          useValue: {
            getRecommendations: jest.fn(),
            ingestBatch: jest.fn(),
          },
        },
        {
          provide: SongService,
          useValue: {
            upsertSongsFromTracks: jest.fn(),
            updateEmbeddings: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            findByIdWithSpotifyToken: jest.fn(),
          },
        },
        {
          provide: EventsService,
          useValue: {
            findById: jest.fn(),
            recalculateStatistics: jest.fn(),
          },
        },
      ],
    }).compile();

    module.useLogger(false);

    service = module.get(PlaylistService);
    spotifyService = module.get(SpotifyService);
    dataEngineService = module.get(DataEngineService);
    songService = module.get(SongService);
    userService = module.get(UserService);
    eventsService = module.get(EventsService);

    // Sensible defaults shared by most tests
    userService.findByIdWithSpotifyToken.mockResolvedValue({
      spotifyAccessToken: "token",
    } as any);
    eventsService.findById.mockResolvedValue({
      title: "Chill Evening",
      context: "Chill evening",
    } as any);
    eventsService.recalculateStatistics.mockResolvedValue(undefined);
    dataEngineService.ingestBatch.mockResolvedValue([]);
    songService.updateEmbeddings.mockResolvedValue(undefined);
  });

  const spotifyTrack = (
    id: string,
    title = `Song ${id}`,
    artist = `Artist ${id}`,
  ) => ({
    id,
    uri: `spotify:track:${id}`,
    title,
    artist,
    url: `https://open.spotify.com/track/${id}`,
  });

  const savedSong = (
    id: string,
    name = `Song ${id}`,
    artistName = `Artist ${id}`,
    embedding: string | null = "[0.1,0.2]",
  ) => ({
    id: `song-${id}`,
    name,
    artistName,
    spotifyUri: `spotify:track:${id}`,
    embedding,
    createdAt: new Date(),
  });

  it("should create a playlist end-to-end", async () => {
    dataEngineService.getRecommendations.mockResolvedValue([
      { title: "Song A", artist: "Artist A", is_new: false },
      { title: "Song B", artist: "Artist B", is_new: true },
    ]);
    spotifyService.searchTrackDetails
      .mockResolvedValueOnce(spotifyTrack("aaa", "Song A", "Artist A"))
      .mockResolvedValueOnce(spotifyTrack("bbb", "Song B", "Artist B"));
    songService.upsertSongsFromTracks.mockResolvedValue([
      savedSong("aaa", "Song A", "Artist A"),
      savedSong("bbb", "Song B", "Artist B"),
    ] as any);
    spotifyService.createPlaylist.mockResolvedValue({
      id: "playlist789",
      url: "https://open.spotify.com/playlist/playlist789",
    } as any);
    spotifyService.addTracksToPlaylist.mockResolvedValue(undefined as any);

    const result = await service.generatePlaylist(EVENT_ID, USER_ID);

    expect(result).toEqual({
      playlistId: "playlist789",
      playlistUrl: "https://open.spotify.com/playlist/playlist789",
      tracksAdded: 2,
      tracksNotFound: [],
      totalRequested: 2,
      tracks: [
        {
          songId: "song-aaa",
          title: "Song A",
          artist: "Artist A",
          spotifyUri: "spotify:track:aaa",
          spotifyUrl: "https://open.spotify.com/track/aaa",
          position: 1,
        },
        {
          songId: "song-bbb",
          title: "Song B",
          artist: "Artist B",
          spotifyUri: "spotify:track:bbb",
          spotifyUrl: "https://open.spotify.com/track/bbb",
          position: 2,
        },
      ],
      hasPendingEmbeddings: false,
    });
    expect(dataEngineService.getRecommendations).toHaveBeenCalledWith(EVENT_ID);
    expect(spotifyService.createPlaylist).toHaveBeenCalledWith(
      "token",
      "Chill Evening",
      true,
      "Generated by JamOn for: Chill evening",
    );
    expect(spotifyService.addTracksToPlaylist).toHaveBeenCalledWith(
      "token",
      "playlist789",
      ["spotify:track:aaa", "spotify:track:bbb"],
    );
  });

  it("should skip tracks not found on Spotify", async () => {
    dataEngineService.getRecommendations.mockResolvedValue([
      { title: "Found Song", artist: "Artist", is_new: false },
      { title: "Missing Song", artist: "Nobody", is_new: true },
    ]);
    spotifyService.searchTrackDetails
      .mockResolvedValueOnce(spotifyTrack("found", "Found Song", "Artist"))
      .mockResolvedValueOnce(null);
    songService.upsertSongsFromTracks.mockResolvedValue([
      savedSong("found", "Found Song", "Artist"),
    ] as any);
    spotifyService.createPlaylist.mockResolvedValue({
      id: "pl1",
      url: "https://open.spotify.com/playlist/pl1",
    } as any);
    spotifyService.addTracksToPlaylist.mockResolvedValue(undefined as any);

    const result = await service.generatePlaylist(EVENT_ID, USER_ID);

    expect(result.tracksAdded).toBe(1);
    expect(result.tracksNotFound).toEqual(["Missing Song by Nobody"]);
    expect(spotifyService.addTracksToPlaylist).toHaveBeenCalledWith(
      "token",
      "pl1",
      ["spotify:track:found"],
    );
  });

  it("should throw NO_TRACKS_RESOLVED when no tracks are found on Spotify", async () => {
    dataEngineService.getRecommendations.mockResolvedValue([
      { title: "Missing", artist: "Nobody", is_new: true },
    ]);
    spotifyService.searchTrackDetails.mockResolvedValue(null);

    try {
      await service.generatePlaylist(EVENT_ID, USER_ID);
      fail("Expected HttpException");
    } catch (e: any) {
      expect(e.getResponse().error).toBe("NO_TRACKS_RESOLVED");
    }
  });

  it("should throw NO_TRACKS_RESOLVED when data engine returns empty", async () => {
    dataEngineService.getRecommendations.mockResolvedValue([]);

    try {
      await service.generatePlaylist(EVENT_ID, USER_ID);
      fail("Expected HttpException");
    } catch (e: any) {
      expect(e.getResponse().error).toBe("NO_TRACKS_RESOLVED");
    }
  });

  it("should throw SPOTIFY_AUTH_EXPIRED when the user has no Spotify token", async () => {
    dataEngineService.getRecommendations.mockResolvedValue([
      { title: "Song", artist: "Artist", is_new: false },
    ]);
    userService.findByIdWithSpotifyToken.mockResolvedValue({
      spotifyAccessToken: null,
    } as any);

    try {
      await service.generatePlaylist(EVENT_ID, USER_ID);
      fail("Expected HttpException");
    } catch (e: any) {
      expect(e.getResponse().error).toBe("SPOTIFY_AUTH_EXPIRED");
    }
  });

  it("should propagate Spotify errors from track search", async () => {
    dataEngineService.getRecommendations.mockResolvedValue([
      { title: "Song", artist: "Artist", is_new: false },
    ]);
    spotifyService.searchTrackDetails.mockRejectedValue({
      response: {
        status: 401,
        data: { error: { message: "The access token expired" } },
      },
    });

    await expect(
      service.generatePlaylist(EVENT_ID, USER_ID),
    ).rejects.toBeDefined();
  });

  it("should throw when playlist creation fails", async () => {
    dataEngineService.getRecommendations.mockResolvedValue([
      { title: "Song", artist: "Artist", is_new: false },
    ]);
    spotifyService.searchTrackDetails.mockResolvedValue(
      spotifyTrack("x", "Song", "Artist"),
    );
    songService.upsertSongsFromTracks.mockResolvedValue([
      savedSong("x", "Song", "Artist"),
    ] as any);
    spotifyService.createPlaylist.mockRejectedValue(
      new Error("Spotify API error"),
    );

    await expect(service.generatePlaylist(EVENT_ID, USER_ID)).rejects.toThrow(
      "Spotify API error",
    );
  });

  it("should deduplicate tracks that resolve to the same Spotify URI", async () => {
    dataEngineService.getRecommendations.mockResolvedValue([
      { title: "Song A", artist: "Artist A", is_new: false },
      { title: "Song A (dup)", artist: "Artist A", is_new: true },
    ]);
    spotifyService.searchTrackDetails
      .mockResolvedValueOnce(spotifyTrack("dupe", "Song A", "Artist A"))
      .mockResolvedValueOnce(spotifyTrack("dupe", "Song A", "Artist A"));
    songService.upsertSongsFromTracks.mockResolvedValue([
      savedSong("dupe", "Song A", "Artist A"),
    ] as any);
    spotifyService.createPlaylist.mockResolvedValue({
      id: "pl-dupe",
      url: "https://open.spotify.com/playlist/pl-dupe",
    } as any);
    spotifyService.addTracksToPlaylist.mockResolvedValue(undefined as any);

    const result = await service.generatePlaylist(EVENT_ID, USER_ID);

    expect(result.tracksAdded).toBe(1);
    expect(spotifyService.addTracksToPlaylist).toHaveBeenCalledWith(
      "token",
      "pl-dupe",
      ["spotify:track:dupe"],
    );
  });

  it("should flag pending embeddings and trigger background ingest for unembedded songs", async () => {
    dataEngineService.getRecommendations.mockResolvedValue([
      { title: "New Song", artist: "New Artist", is_new: true },
    ]);
    spotifyService.searchTrackDetails.mockResolvedValue(
      spotifyTrack("new", "New Song", "New Artist"),
    );
    songService.upsertSongsFromTracks.mockResolvedValue([
      savedSong("new", "New Song", "New Artist", null),
    ] as any);
    spotifyService.createPlaylist.mockResolvedValue({
      id: "pl-new",
      url: "https://open.spotify.com/playlist/pl-new",
    } as any);
    spotifyService.addTracksToPlaylist.mockResolvedValue(undefined as any);

    const result = await service.generatePlaylist(EVENT_ID, USER_ID);

    expect(result.hasPendingEmbeddings).toBe(true);
    expect(dataEngineService.ingestBatch).toHaveBeenCalledWith([
      { title: "New Song", artist: "New Artist" },
    ]);
  });
});
