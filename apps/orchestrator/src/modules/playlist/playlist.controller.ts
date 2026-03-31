import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PlaylistService } from './playlist.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { PlaylistResponseDto, PlaylistError } from './dto/playlist-response.dto';
import { extractBearerToken } from '../../utils/auth';

@Controller('playlists')
export class PlaylistController {
  constructor(private readonly playlistService: PlaylistService) {}

  @Post('generate')
  async generate(
    @Body() dto: CreatePlaylistDto,
    @Headers('authorization') authHeader?: string,
  ): Promise<PlaylistResponseDto> {
    const accessToken = extractBearerToken(authHeader);

    try {
      return await this.playlistService.generatePlaylist(accessToken, dto);
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      const isAuthError =
        error?.response?.status === 401 ||
        error?.statusCode === 401 ||
        error?.status === 401;
      if (isAuthError) {
        throw new HttpException(
          { error: PlaylistError.SPOTIFY_AUTH_EXPIRED, message: 'Spotify access token is invalid or expired' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw new HttpException(
        { error: PlaylistError.PLAYLIST_CREATION_FAILED, message: error?.message || 'Unknown error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
