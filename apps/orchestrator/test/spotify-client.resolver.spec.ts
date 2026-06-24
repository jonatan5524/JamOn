import { HttpException, HttpStatus } from "@nestjs/common";
import { SpotifyClientResolver } from "../src/modules/spotify/spotify-client.resolver";

const client = (key: string) => ({
  key,
  clientId: `${key}-id`,
  clientSecret: `${key}-secret`,
  redirectUri: "http://localhost:3000/api/auth/spotify/callback",
});

describe("SpotifyClientResolver", () => {
  let repo: { findOne: jest.Mock };
  let registry: { getByKey: jest.Mock };
  let resolver: SpotifyClientResolver;

  beforeEach(() => {
    repo = { findOne: jest.fn() };
    registry = { getByKey: jest.fn((key: string) => client(key)) };
    resolver = new SpotifyClientResolver(repo as any, registry as any);
  });

  describe("resolveByEmail", () => {
    it("lowercases the email and returns the assigned client", async () => {
      repo.findOne.mockResolvedValue({ email: "a@b.com", clientKey: "app2" });
      const result = await resolver.resolveByEmail("A@B.com");
      expect(repo.findOne).toHaveBeenCalledWith({ where: { email: "a@b.com" } });
      expect(result.key).toBe("app2");
    });

    it("throws 400 when the email is missing", async () => {
      await expect(resolver.resolveByEmail(undefined)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it("throws 400 when the email has no assignment", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(resolver.resolveByEmail("nobody@x.com")).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe("resolveByState", () => {
    it("extracts the clientKey from the state and returns the client", () => {
      expect(resolver.resolveByState("abc123:app1").key).toBe("app1");
    });

    it("throws 400 when state has no clientKey half", () => {
      expect(() => resolver.resolveByState("abc123")).toThrow(HttpException);
    });

    it("throws 500 when the clientKey is not in the registry (config drift)", () => {
      registry.getByKey.mockImplementation(() => {
        throw new Error("Unknown Spotify client key");
      });
      try {
        resolver.resolveByState("abc:ghost");
        fail("should have thrown");
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });
  });
});
