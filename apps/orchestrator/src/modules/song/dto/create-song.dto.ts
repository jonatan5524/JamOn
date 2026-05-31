import { IsString, IsNotEmpty, IsArray, ArrayNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSongDto {
    @ApiProperty({ example: 'Bohemian Rhapsody', description: 'Song name' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({ example: 'Queen', description: 'Artist name' })
    @IsString()
    @IsNotEmpty()
    artistName!: string;

    @ApiProperty({
        example: [0.1, 0.2, 0.3],
        description: 'Embedding vector produced by the data-engine',
        type: [Number],
    })
    @IsArray()
    @ArrayNotEmpty()
    @IsNumber({}, { each: true })
    embedding!: number[];
}
