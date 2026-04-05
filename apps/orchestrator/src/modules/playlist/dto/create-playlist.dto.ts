import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreatePlaylistDto {
  @IsString()
  @MaxLength(200)
  eventDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  playlistName?: string;

}
