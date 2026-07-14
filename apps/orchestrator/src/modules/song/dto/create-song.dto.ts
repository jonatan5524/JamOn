import { IsString, IsNotEmpty, IsArray, IsNumber, IsOptional } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class CreateSongDto {
    @ApiProperty({ example: 'Bohemian Rhapsody', description: 'Song name' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({ example: 'Queen', description: 'Artist name' })
    @IsString()
    @IsNotEmpty()
    artistName!: string;

    @ApiPropertyOptional({
        example: [0.1, 0.2, 0.3],
        description: 'Embedding vector produced by the data-engine (set separately after indexing)',
        type: [Number],
    })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    embedding?: number[];

    @ApiPropertyOptional({
        example: ['nostalgic', 'upbeat', 'indie'],
        description: 'Descriptive vibe tags produced by the data-engine tagger',
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    vibeTags?: string[];

    @ApiPropertyOptional({ example: 'High-energy, driving', description: "Description of the song's energy level" })
    @IsOptional()
    @IsString()
    energyDesc?: string;

    @ApiPropertyOptional({ example: 'Nostalgic, bittersweet', description: "Description of the song's mood" })
    @IsOptional()
    @IsString()
    moodDesc?: string;
}
