import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Song } from './song.entity';
import { CreateSongDto } from './dto/create-song.dto';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class SongService {
    constructor(
        @InjectRepository(Song)
        private readonly songRepository: Repository<Song>,
    ) {}

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
            embedding: JSON.stringify(dto.embedding),
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

    async findById(id: string): Promise<Song> {
        const song = await this.songRepository.findOne({ where: { id } });
        if (!song) {
            throw new NotFoundException(`Song ${id} not found`);
        }
        return song;
    }
}
