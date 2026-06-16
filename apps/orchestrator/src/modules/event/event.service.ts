import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, QueryFailedError, Repository } from "typeorm";
import { CreateEventDto } from "./dto/create-event.dto";
import { Event } from "./event.entity";
import { EventParticipant } from "./event-participant.entity";
import { EventPlaylistTrack } from "./event-playlist-track.entity";
import { generateEventCode } from "./event-code.util";
import { EventRoleType } from "./event-role.decorator";
import { SongLike } from "../song/song-like.entity";
import type { PlaylistTrackResultDto } from "../playlist/dto/playlist-response.dto";
import type { EventStatistics } from "./event-statistics.types";

const MAX_CODE_RETRIES = 5;
const PG_UNIQUE_VIOLATION = "23505";

type Vector = number[];

export type EventWithRole = Event & {
  viewerRole: EventRoleType;
  statistics?: EventStatistics | null;
};

const parseEmbedding = (embedding: string | number[] | null | undefined): Vector | null => {
  if (!embedding) return null;
  if (Array.isArray(embedding)) return embedding;
  try {
    const parsed = JSON.parse(embedding);
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return null;
  }
};

const averageVectors = (vectors: Vector[]): Vector | null => {
  if (vectors.length === 0) return null;
  const length = vectors[0].length;
  const totals = Array.from({ length }, () => 0);
  let count = 0;

  for (const vector of vectors) {
    if (vector.length !== length) continue;
    vector.forEach((value, index) => {
      totals[index] += value;
    });
    count++;
  }

  return count === 0 ? null : totals.map((total) => total / count);
};

const cosineSimilarity = (a: Vector | null, b: Vector | null): number => {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
};

const roundToHundred = (values: Array<{ id: string; value: number }>): Map<string, number> => {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return new Map(values.map((item) => [item.id, 0]));

  const raw = values.map((item) => {
    const percent = (item.value / total) * 100;
    return {
      id: item.id,
      floor: Math.floor(percent),
      remainder: percent - Math.floor(percent),
    };
  });
  let remaining = 100 - raw.reduce((sum, item) => sum + item.floor, 0);
  raw
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((item) => {
      if (remaining > 0) {
        item.floor++;
        remaining--;
      }
    });

  return new Map(raw.map((item) => [item.id, item.floor]));
};

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(EventParticipant)
    private readonly participantRepository: Repository<EventParticipant>,
    @InjectRepository(EventPlaylistTrack)
    private readonly playlistTrackRepository: Repository<EventPlaylistTrack>,
    @InjectRepository(SongLike)
    private readonly songLikeRepository: Repository<SongLike>,
  ) {}

  async create(createEventDto: CreateEventDto, userId: string): Promise<Event> {
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      try {
        // Event + creator's participant row commit together so a new event
        // is never left without its host as a member.
        return await this.eventRepository.manager.transaction(async (manager) => {
          const newEvent = manager.create(Event, {
            title: createEventDto.title,
            context: createEventDto.context,
            code: generateEventCode(),
            creator: { id: userId } as any,
          });
          const saved = await manager.save(newEvent);

          const participant = manager.create(EventParticipant, {
            eventId: saved.id,
            userId,
          });
          await manager.save(participant);

          return saved;
        });
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          (err as any).code === PG_UNIQUE_VIOLATION
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new InternalServerErrorException(
      "Failed to generate unique event code",
    );
  }

  private roleFor(event: Event, userId: string): EventRoleType | null {
    if (event.creator?.id === userId) return "creator";
    if (event.participants?.some((p) => p.userId === userId)) return "participant";
    return null;
  }

  async findById(id: string, userId: string): Promise<EventWithRole> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ["participants", "participants.user", "creator"],
    });
    if (!event) {
      throw new NotFoundException(`Event ${id} not found`);
    }

    const role = this.roleFor(event, userId);
    if (!role) {
      throw new ForbiddenException("You are not a member of this event");
    }

    return Object.assign(event, { viewerRole: role });
  }

  // Lightweight role lookup for EventRoleGuard (no participant.user join).
  async getViewerRole(id: string, userId: string): Promise<EventRoleType> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ["participants", "creator"],
    });
    if (!event) {
      throw new NotFoundException(`Event ${id} not found`);
    }

    const role = this.roleFor(event, userId);
    if (!role) {
      throw new ForbiddenException("You are not a member of this event");
    }

    return role;
  }

  async findByCode(code: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!event) {
      throw new NotFoundException(`Event with code ${code} not found`);
    }
    return event;
  }

  async savePlaylistResult(
    eventId: string,
    playlistId: string,
    playlistUrl: string,
    tracksAdded: number,
    tracks: PlaylistTrackResultDto[] = [],
  ): Promise<void> {
    await this.eventRepository.manager.transaction(async (manager) => {
      await manager.update(Event, eventId, {
        playlistId,
        playlistUrl,
        tracksAdded,
        statistics: null,
      });

      await manager.delete(EventPlaylistTrack, { eventId });

      if (tracks.length > 0) {
        await manager.insert(
          EventPlaylistTrack,
          tracks.map((track) => ({
            eventId,
            songId: track.songId,
            position: track.position,
          })),
        );
      }
    });

    const event = await this.eventRepository.findOne({
      where: { id: eventId },
      relations: ["participants", "participants.user", "creator"],
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    const statistics = await this.calculateStatisticsForEvent(event);
    await this.eventRepository.update(eventId, { statistics });
  }

  async joinEvent(eventId: string, userId: string): Promise<EventParticipant> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    const existing = await this.participantRepository.findOne({
      where: { eventId, userId },
    });
    if (existing) {
      return existing;
    }

    const participant = this.participantRepository.create({ eventId, userId });
    try {
      return await this.participantRepository.save(participant);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as any).code === PG_UNIQUE_VIOLATION
      ) {
        return this.participantRepository.findOneOrFail({
          where: { eventId, userId },
        });
      }
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<Event[]> {
    return await this.eventRepository.find({
      where: [
        { participants: { userId: userId } },
        { creator: { id: userId } },
      ],
      order: {
        createdAt: "DESC",
      },
    });
  }

  private async calculateStatisticsForEvent(event: Event): Promise<EventStatistics> {
    if (!event.participants?.length) {
      return {
        playlistMatchPercent: 0,
        tracks: [],
        contributions: [],
      };
    }

    const playlistTracks = await this.playlistTrackRepository.find({
      where: { eventId: event.id },
      relations: ["song"],
      order: { position: "ASC" },
    });
    if (playlistTracks.length === 0) {
      return {
        playlistMatchPercent: 0,
        tracks: [],
        contributions: event.participants.map((participant) => ({
          participantId: participant.userId,
          participantName:
            participant.user?.displayName?.trim() ||
            participant.user?.email ||
            participant.userId,
          percent: 0,
        })),
      };
    }

    const participantIds = event.participants.map((participant) => participant.userId);
    const likes = await this.songLikeRepository.find({
      where: { userId: In(participantIds) },
      relations: ["song"],
    });

    const vectorsByParticipant = new Map<string, Vector[]>();
    for (const like of likes) {
      const embedding = parseEmbedding(like.song?.embedding);
      if (!embedding) continue;
      const vectors = vectorsByParticipant.get(like.userId) ?? [];
      vectors.push(embedding);
      vectorsByParticipant.set(like.userId, vectors);
    }

    const tasteVectors = new Map<string, Vector>();
    for (const participantId of participantIds) {
      const vector = averageVectors(vectorsByParticipant.get(participantId) ?? []);
      if (vector) tasteVectors.set(participantId, vector);
    }

    const scoreTotals = new Map(participantIds.map((id) => [id, 0]));
    const tracks = playlistTracks.map((track) => {
      const trackVector = parseEmbedding(track.song?.embedding);
      const scores = participantIds
        .map((participantId) => ({
          participantId,
          score: Math.max(
            0,
            cosineSimilarity(trackVector, tasteVectors.get(participantId) ?? null),
          ),
        }))
        .sort((a, b) => b.score - a.score);

      const scoreSum = scores.reduce((sum, item) => sum + item.score, 0);
      if (scoreSum > 0) {
        for (const item of scores) {
          scoreTotals.set(
            item.participantId,
            (scoreTotals.get(item.participantId) ?? 0) + item.score / scoreSum,
          );
        }
      }

      const topScore = scores[0]?.score ?? 0;
      const contributorIds =
        topScore <= 0
          ? []
          : scores
              .filter((item, index) => index < 2 || item.score >= topScore * 0.95)
              .slice(0, 3)
              .map((item) => item.participantId);

      return {
        id: track.songId,
        position: track.position,
        title: track.song.name,
        artist: track.song.artistName,
        spotifyUrl: track.song.spotifyUri
          ? `https://open.spotify.com/track/${track.song.spotifyUri.split(":").pop()}`
          : undefined,
        contributorIds,
      };
    });

    const percentages = roundToHundred(
      participantIds.map((participantId) => ({
        id: participantId,
        value: scoreTotals.get(participantId) ?? 0,
      })),
    );

    const participantName = (participant: EventParticipant) =>
      participant.user?.displayName?.trim() ||
      participant.user?.email ||
      participant.userId;

    const participantTasteVectors = [...tasteVectors.values()];
    const playlistVectors = playlistTracks
      .map((track) => parseEmbedding(track.song?.embedding))
      .filter((vector): vector is Vector => Boolean(vector));
    const playlistMatchPercent = Math.round(
      Math.max(
        0,
        Math.min(
          1,
          cosineSimilarity(
            averageVectors(participantTasteVectors),
            averageVectors(playlistVectors),
          ),
        ),
      ) * 100,
    );

    return {
      playlistMatchPercent,
      tracks,
      contributions: event.participants.map((participant) => ({
        participantId: participant.userId,
        participantName: participantName(participant),
        percent: percentages.get(participant.userId) ?? 0,
      })),
    };
  }
}
