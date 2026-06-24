import { Test } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { of, throwError } from "rxjs";
import { AxiosResponse } from "axios";
import { HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "../src/modules/auth/auth.service";
import { UserService } from "../src/modules/user/user.service";
import { SpotifyService } from "../src/modules/spotify/spotify.service";
import { DataEngineService } from "../src/modules/data-engine/data-engine.service";
import { SongService } from "../src/modules/song/song.service";
import { SpotifyClient } from "../src/modules/spotify/spotify-client.types";

const mockAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
  data,
  status: 200,
  statusText: "OK",
  headers: {},
  config: { headers: {} } as any,
});

describe("AuthService", () => {
  let service: AuthService;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;

  const client: SpotifyClient = {
    key: "app1",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    redirectUri: "http://localhost:3000/api/auth/spotify/callback",
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: HttpService,
          useValue: { post: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => ({
              SPOTIFY_CLIENT_ID: "test-client-id",
              SPOTIFY_CLIENT_SECRET: "test-client-secret",
              SPOTIFY_REDIRECT_URI: "http://localhost:3000/auth/spotify/callback",
            }[key] ?? "")),
          },
        },
        {
          provide: UserService,
          useValue: {},
        },
        {
          provide: JwtService,
          useValue: {},
        },
        {
          provide: SpotifyService,
          useValue: {},
        },
        {
          provide: DataEngineService,
          useValue: {},
        },
        {
          provide: SongService,
          useValue: {},
        },
      ],
    }).compile();

    module.useLogger(false);
    service = module.get(AuthService);
    httpService = module.get(HttpService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getAuthorizationUrl", () => {
    it("includes required scopes and a state ending in the client key", () => {
      const { url, state } = service.getAuthorizationUrl(client);
      const parsedUrl = new URL(url);
      const scope = parsedUrl.searchParams.get("scope");

      expect(state).toMatch(/^[a-f0-9]{32}:app1$/);
      expect(parsedUrl.origin).toBe("https://accounts.spotify.com");
      expect(parsedUrl.pathname).toBe("/authorize");
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsedUrl.searchParams.get("redirect_uri")).toBe(client.redirectUri);
      expect(parsedUrl.searchParams.get("state")).toBe(state);
      expect(scope).toContain("playlist-modify-public");
      expect(scope).toContain("user-top-read");
    });
  });

  describe("exchangeCodeForToken", () => {
    it("should exchange code and return spotify token response", async () => {
      httpService.post.mockReturnValue(
        of(
          mockAxiosResponse({
            access_token: "access-token",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "refresh-token",
            scope: "user-read-private",
          }),
        ),
      );

      const result = await service.exchangeCodeForToken("auth-code", client);

      expect(result).toEqual({
        access_token: "access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh-token",
        scope: "user-read-private",
      });
      expect(httpService.post).toHaveBeenCalledWith(
        "https://accounts.spotify.com/api/token",
        expect.stringContaining("code=auth-code"),
        expect.objectContaining({
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }),
      );
    });

    it("should map Spotify API errors to HttpException", async () => {
      expect.assertions(2);
      httpService.post.mockReturnValue(
        throwError(() => ({
          response: {
            status: 400,
            data: { error: "invalid_grant" },
          },
          message: "Request failed with status code 400",
        })),
      );

      try {
        await service.exchangeCodeForToken("bad-code", client);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      }
    });
  });
});
