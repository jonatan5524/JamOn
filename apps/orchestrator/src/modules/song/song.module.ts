import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Song } from './song.entity';
import { SongLike } from './song-like.entity';
import { SongService } from './song.service';
import { SongController } from './song.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Song, SongLike])],
    controllers: [SongController],
    providers: [SongService],
    exports: [SongService],
})
export class SongModule {}
