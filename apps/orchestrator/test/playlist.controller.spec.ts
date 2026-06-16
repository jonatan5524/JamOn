import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PlaylistController } from '../src/modules/playlist/playlist.controller';
import { PlaylistService } from '../src/modules/playlist/playlist.service';

describe('PlaylistController', () => {
  let app: INestApplication;
  let playlistService: jest.Mocked<PlaylistService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PlaylistController],
      providers: [
        {
          provide: PlaylistService,
          useValue: {
            generatePlaylist: jest.fn(),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    playlistService = module.get(PlaylistService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /playlists/generate — success', async () => {
    playlistService.generatePlaylist.mockResolvedValue({
      playlistId: 'pl1',
      playlistUrl: 'https://open.spotify.com/playlist/pl1',
      tracksAdded: 18,
      tracksNotFound: ['Song X by Artist Y'],
      totalRequested: 20,
      tracks: [],
    });

    const response = await request(app.getHttpServer())
      .post('/playlists/generate')
      .set('Authorization', 'Bearer test-token')
      .send({ eventDescription: 'Chill evening' })
      .expect(201);

    expect(response.body.playlistId).toBe('pl1');
    expect(playlistService.generatePlaylist).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ eventDescription: 'Chill evening' }),
    );
  });

  it('POST /playlists/generate — missing eventDescription returns 400', async () => {
    await request(app.getHttpServer())
      .post('/playlists/generate')
      .set('Authorization', 'Bearer test-token')
      .send({})
      .expect(400);
  });

  it('POST /playlists/generate — missing auth header returns 401', async () => {
    await request(app.getHttpServer())
      .post('/playlists/generate')
      .send({ eventDescription: 'Test' })
      .expect(401);
  });

  it('POST /playlists/generate — Spotify 401 returns SPOTIFY_AUTH_EXPIRED', async () => {
    playlistService.generatePlaylist.mockRejectedValue({
      statusCode: 401,
      body: { error: { status: 401, message: 'The access token expired' } },
    });

    const response = await request(app.getHttpServer())
      .post('/playlists/generate')
      .set('Authorization', 'Bearer expired-token')
      .send({ eventDescription: 'Test event' })
      .expect(401);

    expect(response.body.error).toBe('SPOTIFY_AUTH_EXPIRED');
  });

  it('POST /playlists/generate — unknown error returns PLAYLIST_CREATION_FAILED', async () => {
    playlistService.generatePlaylist.mockRejectedValue(new Error('Something broke'));

    const response = await request(app.getHttpServer())
      .post('/playlists/generate')
      .set('Authorization', 'Bearer valid-token')
      .send({ eventDescription: 'Test event' })
      .expect(500);

    expect(response.body.error).toBe('PLAYLIST_CREATION_FAILED');
  });
});
