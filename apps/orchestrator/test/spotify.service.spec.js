"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const spotify_service_1 = require("../src/modules/spotify/spotify.service");
const mockAxiosResponse = (data) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} },
});
describe('SpotifyService', () => {
    let service;
    let httpService;
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                spotify_service_1.SpotifyService,
                {
                    provide: axios_1.HttpService,
                    useValue: {
                        request: jest.fn(),
                    },
                },
            ],
        }).compile();
        service = module.get(spotify_service_1.SpotifyService);
        httpService = module.get(axios_1.HttpService);
        module.useLogger(false);
    });
    describe('searchTrack', () => {
        it('should return track URI when found', async () => {
            httpService.request.mockReturnValue((0, rxjs_1.of)(mockAxiosResponse({ tracks: { items: [{ uri: 'spotify:track:abc123', name: 'Test Song' }] } })));
            const result = await service.searchTrack('token', 'Test Song', 'Test Artist');
            expect(result).toBe('spotify:track:abc123');
            expect(httpService.request).toHaveBeenCalledWith(expect.objectContaining({
                method: 'get',
                url: expect.stringContaining('/search?q='),
                headers: { Authorization: 'Bearer token' },
            }));
        });
        it('should return null when no tracks found', async () => {
            httpService.request.mockReturnValue((0, rxjs_1.of)(mockAxiosResponse({ tracks: { items: [] } })));
            const result = await service.searchTrack('token', 'Unknown Song', 'Nobody');
            expect(result).toBeNull();
        });
    });
    describe('createPlaylist', () => {
        it('should create and return playlist id and url', async () => {
            httpService.request.mockReturnValue((0, rxjs_1.of)(mockAxiosResponse({
                id: 'playlist456',
                external_urls: { spotify: 'https://open.spotify.com/playlist/playlist456' },
            })));
            const result = await service.createPlaylist('token', 'My Playlist', true, 'A description');
            expect(result).toEqual({
                id: 'playlist456',
                url: 'https://open.spotify.com/playlist/playlist456',
            });
            expect(httpService.request).toHaveBeenCalledWith(expect.objectContaining({
                method: 'post',
                url: '/me/playlists',
                data: { name: 'My Playlist', public: true, description: 'A description' },
            }));
        });
    });
    describe('addTracksToPlaylist', () => {
        it('should add track URIs to playlist via /items endpoint', async () => {
            httpService.request.mockReturnValue((0, rxjs_1.of)(mockAxiosResponse({ snapshot_id: 'snap1' })));
            await service.addTracksToPlaylist('token', 'playlist456', ['spotify:track:a', 'spotify:track:b']);
            expect(httpService.request).toHaveBeenCalledWith(expect.objectContaining({
                method: 'post',
                url: '/playlists/playlist456/items',
                data: { uris: ['spotify:track:a', 'spotify:track:b'] },
            }));
        });
    });
    describe('expired token (401)', () => {
        it('should throw on 401 from searchTrack', async () => {
            httpService.request.mockReturnValue((0, rxjs_1.throwError)(() => ({
                response: { status: 401, data: { error: { message: 'The access token expired' } } },
            })));
            await expect(service.searchTrack('bad-token', 'Song', 'Artist')).rejects.toBeDefined();
        });
        it('should throw on 401 from createPlaylist', async () => {
            httpService.request.mockReturnValue((0, rxjs_1.throwError)(() => ({
                response: { status: 401, data: { error: { message: 'The access token expired' } } },
            })));
            await expect(service.createPlaylist('bad-token', 'Name', false, 'Desc')).rejects.toBeDefined();
        });
    });
});
//# sourceMappingURL=spotify.service.spec.js.map