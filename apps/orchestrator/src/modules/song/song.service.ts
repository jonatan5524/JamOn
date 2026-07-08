import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, QueryFailedError, Repository } from 'typeorm';
import { Song } from './song.entity';
import { SongLike } from './song-like.entity';
import { CreateSongDto } from './dto/create-song.dto';
import { SimplifiedTrack } from '../spotify/spotify.types';

const PG_UNIQUE_VIOLATION = '23505';

const songKey = (name: string, artistName: string): string =>
    `${name.trim().toLowerCase()}::${artistName.trim().toLowerCase()}`;

@Injectable()
export class SongService {
    constructor(
        @InjectRepository(Song)
        private readonly songRepository: Repository<Song>,
        @InjectRepository(SongLike)
        private readonly songLikeRepository: Repository<SongLike>,
    ) {}

    /**
     * Inserts songs that don't exist yet (name + artistName only, no embedding),
     * then returns the full Song rows for every track in the input list.
     */
    async upsertSongsFromTracks(tracks: SimplifiedTrack[]): Promise<Song[]> {
        if (tracks.length === 0) return [];

        const newSongs = tracks.map((t) =>
            this.songRepository.create({
                name: t.title,
                artistName: t.artist,
                spotifyUri: t.spotifyUri ?? null,
            }),
        );

        await this.songRepository
            .createQueryBuilder()
            .insert()
            .into(Song)
            .values(newSongs)
            .orIgnore()
            .execute();

        await Promise.all(
            tracks
                .filter((track) => track.spotifyUri)
                .map((track) =>
                    this.songRepository.update(
                        { name: track.title, artistName: track.artist },
                        { spotifyUri: track.spotifyUri },
                    ),
                ),
        );

        const rows = await this.songRepository
            .createQueryBuilder('song')
            .where(new Brackets((qb) => {
                tracks.forEach((t, i) => {
                    qb.orWhere(
                        `(song.name = :name${i} AND song.artistName = :artist${i})`,
                        { [`name${i}`]: t.title, [`artist${i}`]: t.artist },
                    );
                });
            }))
            .getMany();

        const byKey = new Map(
            rows.map((song) => [songKey(song.name, song.artistName), song]),
        );
        return tracks
            .map((track) => byKey.get(songKey(track.title, track.artist)))
            .filter((song): song is Song => Boolean(song));
    }

    /**
     * Records that a user likes a set of songs. Silently skips already-existing pairs.
     */
    async bulkUpsertLikes(userId: string, songIds: string[]): Promise<void> {
        if (songIds.length === 0) return;

        await this.songLikeRepository
            .createQueryBuilder()
            .delete()
            .from(SongLike)
            .where('userId = :userId AND songId NOT IN (:...songIds)', { userId, songIds })
            .execute();

        await this.songLikeRepository
            .createQueryBuilder()
            .insert()
            .into(SongLike)
            .values(songIds.map((songId) => ({ userId, songId })))
            .orIgnore()
            .execute();
    }

    /**
     * Updates the embedding on existing Song rows returned by the data-engine.
     */
    async updateEmbeddings(dtos: CreateSongDto[]): Promise<void> {
        if (dtos.length === 0) return;

        await Promise.all(
            dtos
                .filter((dto) => dto.embedding !== undefined)
                .map((dto) =>
                    this.songRepository.update(
                        { name: dto.name, artistName: dto.artistName },
                        { embedding: JSON.stringify(dto.embedding) },
                    ),
                ),
        );
    }

    async create(dto: CreateSongDto): Promise<Song> {
        const existing = await this.songRepository.findOne({
            where: { name: dto.name, artistName: dto.artistName },
        });

        if (existing) {
            throw new ConflictException(
                `Song "${dto.name}" by "${dto.artistName}" is already saved`,
            );
        }

        const song = this.songRepository.create({
            name: dto.name,
            artistName: dto.artistName,
            ...(dto.embedding && { embedding: JSON.stringify(dto.embedding) }),
        });

        try {
            return await this.songRepository.save(song);
        } catch (err) {
            if (err instanceof QueryFailedError && (err as any).code === PG_UNIQUE_VIOLATION) {
                throw new ConflictException(
                    `Song "${dto.name}" by "${dto.artistName}" is already saved`,
                );
            }
            throw err;
        }
    }

    /**
     * Returns user IDs of event participants who have zero liked songs.
     * Used to detect participants whose library has never been synced.
     */
    async findParticipantsWithoutLikes(eventId: string): Promise<string[]> {
        const rows: { user_id: string }[] = await this.songLikeRepository.manager.query(
            `SELECT ep.user_id
             FROM event_participants ep
             WHERE ep.event_id = $1
               AND NOT EXISTS (
                   SELECT 1 FROM song_likes sl WHERE sl.user_id = ep.user_id
               )`,
            [eventId],
        );
        return rows.map((r) => r.user_id);
    }

    /**
     * Returns songs liked by any participant of the event that have no embedding yet.
     * Used to identify the delta that must be ingested before running a recommendation.
     */
    async findUnembeddedSongsForEvent(eventId: string): Promise<Pick<Song, 'name' | 'artistName'>[]> {
        return this.songRepository
            .createQueryBuilder('song')
            .innerJoin('song_likes', 'sl', 'sl.song_id = song.id')
            .innerJoin('event_participants', 'ep', 'ep.user_id = sl.user_id')
            .where('ep.event_id = :eventId', { eventId })
            .andWhere('song.embedding IS NULL')
            .select(['song.name', 'song.artistName'])
            .distinct(true)
            .getMany();
    }

    async findById(id: string): Promise<Song> {
        const song = await this.songRepository.findOne({ where: { id } });
        if (!song) {
            throw new NotFoundException(`Song ${id} not found`);
        }
        return song;
    }
}
