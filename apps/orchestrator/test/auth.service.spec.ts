import { Test } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { of, throwError } from "rxjs";
import { AxiosResponse } from "axios";
import { HttpException, HttpStatus } from "@nestjs/common";
import { AuthService } from "../src/modules/auth/auth.service";

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
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      SPOTIFY_CLIENT_ID: "test-client-id",
      SPOTIFY_CLIENT_SECRET: "test-client-secret",
      SPOTIFY_REDIRECT_URI: "http://localhost:3000/auth/spotify/callback",
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
      ],
    }).compile();

    module.useLogger(false);
    service = module.get(AuthService);
    httpService = module.get(HttpService);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe("getAuthorizationUrl", () => {
    it("should include required scopes and generated state in authorization URL", () => {
      const { url, state } = service.getAuthorizationUrl();
      const parsedUrl = new URL(url);
      const scope = parsedUrl.searchParams.get("scope");

      expect(state).toHaveLength(32);
      expect(parsedUrl.origin).toBe("https://accounts.spotify.com");
      expect(parsedUrl.pathname).toBe("/authorize");
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsedUrl.searchParams.get("response_type")).toBe("code");
      expect(parsedUrl.searchParams.get("state")).toBe(state);
      expect(scope).toContain("playlist-modify-public");
      expect(scope).toContain("playlist-modify-private");
      expect(scope).toContain("user-read-private");
      expect(scope).toContain("user-read-email");
      expect(scope).toContain("user-top-read");
    });
  });

  describe("configuration validation", () => {
    it("should throw when spotify oauth env vars are missing", () => {
      process.env = {
        ...originalEnv,
      };
      delete process.env.SPOTIFY_CLIENT_ID;
      delete process.env.SPOTIFY_CLIENT_SECRET;

      expect(() => new AuthService({} as HttpService)).toThrow(
        "Missing Spotify OAuth configuration: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required",
      );
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
            scope: "user-read-private",
          }),
        ),
      );

      const result = await service.exchangeCodeForToken("auth-code");

      expect(result).toEqual({
        access_token: "access-token",
        token_type: "Bearer",
        expires_in: 3600,
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
        await service.exchangeCodeForToken("bad-code");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      }
    });
  });
});
