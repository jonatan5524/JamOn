"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const supertest_1 = __importDefault(require("supertest"));
const playlist_controller_1 = require("../src/modules/playlist/playlist.controller");
const playlist_service_1 = require("../src/modules/playlist/playlist.service");
describe('PlaylistController', () => {
    let app;
    let playlistService;
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            controllers: [playlist_controller_1.PlaylistController],
            providers: [
                {
                    provide: playlist_service_1.PlaylistService,
                    useValue: {
                        generatePlaylist: jest.fn(),
                    },
                },
            ],
        }).compile();
        app = module.createNestApplication();
        app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
        playlistService = module.get(playlist_service_1.PlaylistService);
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
        });
        const response = await (0, supertest_1.default)(app.getHttpServer())
            .post('/playlists/generate')
            .set('Authorization', 'Bearer test-token')
            .send({ eventDescription: 'Chill evening' })
            .expect(201);
        expect(response.body.playlistId).toBe('pl1');
        expect(playlistService.generatePlaylist).toHaveBeenCalledWith('test-token', expect.objectContaining({ eventDescription: 'Chill evening' }));
    });
    it('POST /playlists/generate — missing eventDescription returns 400', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/playlists/generate')
            .set('Authorization', 'Bearer test-token')
            .send({})
            .expect(400);
    });
    it('POST /playlists/generate — missing auth header returns 401', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/playlists/generate')
            .send({ eventDescription: 'Test' })
            .expect(401);
    });
    it('POST /playlists/generate — Spotify 401 returns SPOTIFY_AUTH_EXPIRED', async () => {
        playlistService.generatePlaylist.mockRejectedValue({
            statusCode: 401,
            body: { error: { status: 401, message: 'The access token expired' } },
        });
        const response = await (0, supertest_1.default)(app.getHttpServer())
            .post('/playlists/generate')
            .set('Authorization', 'Bearer expired-token')
            .send({ eventDescription: 'Test event' })
            .expect(401);
        expect(response.body.error).toBe('SPOTIFY_AUTH_EXPIRED');
    });
    it('POST /playlists/generate — unknown error returns PLAYLIST_CREATION_FAILED', async () => {
        playlistService.generatePlaylist.mockRejectedValue(new Error('Something broke'));
        const response = await (0, supertest_1.default)(app.getHttpServer())
            .post('/playlists/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ eventDescription: 'Test event' })
            .expect(500);
        expect(response.body.error).toBe('PLAYLIST_CREATION_FAILED');
    });
});
//# sourceMappingURL=playlist.controller.spec.js.map