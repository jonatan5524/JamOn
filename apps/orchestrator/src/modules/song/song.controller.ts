import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SongService } from './song.service';
import { CreateSongDto } from './dto/create-song.dto';

@ApiTags('Songs')
@Controller('api/songs')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT-auth')
export class SongController {
    constructor(private readonly songService: SongService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Save a song to the database' })
    @ApiResponse({ status: 201, description: 'Song saved successfully.' })
    @ApiResponse({ status: 400, description: 'Invalid payload.' })
    @ApiResponse({ status: 409, description: 'Song already exists.' })
    async createSong(@Body() dto: CreateSongDto) {
        return this.songService.create(dto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a song by ID' })
    @ApiParam({ name: 'id', description: 'Song ID' })
    @ApiResponse({ status: 200, description: 'Song returned.' })
    @ApiResponse({ status: 404, description: 'Song not found.' })
    async getSong(@Param('id') id: string) {
        return this.songService.findById(id);
    }
}
