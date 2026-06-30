import { Injectable, Logger, HttpException, HttpStatus } from "@nestjs/common";
import { SpotifyService } from "../spotify/spotify.service";
import { DataEngineService } from "../data-engine/data-engine.service";
import { SongService } from "../song/song.service";
import {
  PlaylistResponseDto,
  PlaylistError,
  PlaylistTrackResultDto,
} from "./dto/playlist-response.dto";
import { UserService } from "../user/user.service";
import { EventsService } from "../event/event.service";
import { SpotifyTrackMatch } from "../spotify/spotify.types";
import { AuthService } from "../auth/auth.service";

@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);

  constructor(
    private readonly spotifyService: SpotifyService,
    private readonly dataEngineService: DataEngineService,
    private readonly userService: UserService,
    private readonly eventsService: EventsService,
    private readonly songService: SongService,
    private readonly authService: AuthService,
  ) {}

  async generatePlaylist(
    eventId: string,
    userId: string,
  ): Promise<PlaylistResponseDto> {
    this.logger.log(
      `[generatePlaylist] START — eventId="${eventId}"`,
    );

    // Ensure every participant has a synced library before touching the vector DB.
    const unsyncedUserIds = await this.songService.findParticipantsWithoutLikes(eventId);
    if (unsyncedUserIds.length > 0) {
      this.logger.log(
        `[generatePlaylist] ${unsyncedUserIds.length} participant(s) have no liked songs — running library sync`,
      );
      await Promise.all(
        unsyncedUserIds.map(async (participantId) => {
          const participant = await this.userService.findByIdWithSpotifyToken(participantId);
          if (!participant?.spotifyAccessToken) {
            this.logger.warn(`[generatePlaylist] No Spotify token for participant ${participantId} — skipping sync`);
            return;
          }
          await this.authService.triggerLibrarySync(participant.spotifyAccessToken, participantId);
        }),
      );
      this.logger.log(`[generatePlaylist] Participant library sync complete`);
    } else {
      this.logger.log(`[generatePlaylist] All participants have a synced library`);
    }

    // Ensure every library song for this event has a vector before we query the DB.
    const unembeddedLibrarySongs = await this.songService.findUnembeddedSongsForEvent(eventId);
    if (unembeddedLibrarySongs.length > 0) {
      this.logger.log(
        `[generatePlaylist] ${unembeddedLibrarySongs.length} library song(s) missing embeddings — ingesting before recommend`,
      );
      const dtos = await this.dataEngineService.ingestBatch(
        unembeddedLibrarySongs.map((s) => ({ title: s.name, artist: s.artistName })),
      );
      await this.songService.updateEmbeddings(dtos);
      this.logger.log(`[generatePlaylist] Library sync complete — ${dtos.length} embedding(s) stored`);
    } else {
      this.logger.log(`[generatePlaylist] All library songs already embedded — skipping pre-ingest`);
    }

    this.logger.log("[generatePlaylist] Calling data-engine /recommend...");
    const songs = await this.dataEngineService.getRecommendations(
      eventId
    );
    this.logger.log(
      `[generatePlaylist] Data-engine returned ${songs.length} recommendations`,
    );

    if (!songs.length) {
      throw new HttpException(
        {
          error: PlaylistError.NO_TRACKS_RESOLVED,
          message: "Data engine returned no recommendations",
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 2. Resolve each song to a Spotify URI (concurrency limit of 5)
    const resolvedTracks: SpotifyTrackMatch[] = [];
    const notFound: string[] = [];

    const { spotifyAccessToken } = await this.userService.findByIdWithSpotifyToken(userId) || { spotifyAccessToken: null };

    if (!spotifyAccessToken) {
      throw new HttpException(
        {
          error: PlaylistError.SPOTIFY_AUTH_EXPIRED,
          message: "User does not have a valid Spotify access token",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const chunks: (typeof songs)[] = [];
    for (let i = 0; i < songs.length; i += 5) {
      chunks.push(songs.slice(i, i + 5));
    }

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map(async (song) => {
          const track = await this.spotifyService.searchTrackDetails(
            spotifyAccessToken,
            song.title,
            song.artist,
          );
          return { song, track };
        }),
      );

      for (const { song, track } of results) {
        if (track) {
          resolvedTracks.push(track);
        } else {
          notFound.push(`${song.title} by ${song.artist}`);
        }
      }
    }

    const seenUris = new Set<string>();
    const uniqueResolvedTracks = resolvedTracks.filter((track) => {
      if (seenUris.has(track.uri)) return false;
      seenUris.add(track.uri);
      return true;
    });
    resolvedTracks.length = 0;
    resolvedTracks.push(...uniqueResolvedTracks);

    if (resolvedTracks.length === 0) {
      throw new HttpException(
        {
          error: PlaylistError.NO_TRACKS_RESOLVED,
          message: `None of the ${songs.length} songs were found on Spotify`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const savedSongs = await this.songService.upsertSongsFromTracks(
      resolvedTracks.map((track) => ({
        title: track.title,
        artist: track.artist,
        spotifyUri: track.uri,
        spotifyUrl: track.url,
      })),
    );

    const unembedded = savedSongs.filter((song) => !song.embedding);

    const playlistTracks: PlaylistTrackResultDto[] = resolvedTracks.map(
      (track, index) => {
        const song = savedSongs[index];
        return {
          songId: song.id,
          title: song.name,
          artist: song.artistName,
          spotifyUri: track.uri,
          spotifyUrl: track.url,
          position: index + 1,
        };
      },
    );

    // 3. Create the playlist

    const { title, context } = await this.eventsService.findById(eventId, userId);

    const playlistName = title;
    const isPublic = true;
    const description = `Generated by JamOn for: ${context}`;
    this.logger.log(
      `[generatePlaylist] Creating Spotify playlist: "${playlistName}"`,
    );
    const playlist = await this.spotifyService.createPlaylist(
      spotifyAccessToken,
      playlistName,
      isPublic,
      description,
    );

    // 4. Add tracks
    this.logger.log(
      `[generatePlaylist] Adding ${resolvedTracks.length} tracks to playlist ${playlist.id}`,
    );
    await this.spotifyService.addTracksToPlaylist(
      spotifyAccessToken,
      playlist.id,
      resolvedTracks.map((track) => track.uri),
    );

    this.logger.log(
      `[generatePlaylist] DONE — playlistId=${playlist.id}, url=${playlist.url}, added=${resolvedTracks.length}, notFound=${notFound.length}`,
    );

    if (unembedded.length > 0) {
      this.logger.log(
        `[generatePlaylist] Background: sending ${unembedded.length} new track(s) for embedding`,
      );
      this.dataEngineService
        .ingestBatch(unembedded.map((song) => ({ title: song.name, artist: song.artistName })))
        .then((dtos) => this.songService.updateEmbeddings(dtos))
        .catch((err) =>
          this.logger.error(`[generatePlaylist] Background ingest failed: ${err?.message}`, err),
        )
        .then(() => this.eventsService.recalculateStatistics(eventId))
        .catch((err) =>
          this.logger.error(`[generatePlaylist] Background stats recalc failed: ${err?.message}`, err),
        );
    }

    return {
      playlistId: playlist.id,
      playlistUrl: playlist.url,
      tracksAdded: resolvedTracks.length,
      tracksNotFound: notFound,
      totalRequested: songs.length,
      tracks: playlistTracks,
      hasPendingEmbeddings: unembedded.length > 0,
    };
  }
}
