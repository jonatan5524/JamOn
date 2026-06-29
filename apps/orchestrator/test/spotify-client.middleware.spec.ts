import { SpotifyClientMiddleware } from "../src/modules/spotify/spotify-client.middleware";

const client = { key: "app1", clientId: "i", clientSecret: "s", redirectUri: "r" };

describe("SpotifyClientMiddleware", () => {
  let resolver: { resolveByEmail: jest.Mock; resolveByState: jest.Mock };
  let middleware: SpotifyClientMiddleware;

  beforeEach(() => {
    resolver = {
      resolveByEmail: jest.fn().mockResolvedValue(client),
      resolveByState: jest.fn().mockReturnValue(client),
    };
    middleware = new SpotifyClientMiddleware(resolver as any);
  });

  it("resolves by state when state is present", async () => {
    const req: any = { query: { state: "rand:app1" } };
    const next = jest.fn();
    await middleware.use(req, {} as any, next);
    expect(resolver.resolveByState).toHaveBeenCalledWith("rand:app1");
    expect(req.spotifyClient).toBe(client);
    expect(next).toHaveBeenCalledWith();
  });

  it("resolves by email when only email is present", async () => {
    const req: any = { query: { email: "a@b.com" } };
    const next = jest.fn();
    await middleware.use(req, {} as any, next);
    expect(resolver.resolveByEmail).toHaveBeenCalledWith("a@b.com");
    expect(req.spotifyClient).toBe(client);
    expect(next).toHaveBeenCalledWith();
  });

  it("passes resolver errors to next()", async () => {
    const boom = new Error("unregistered");
    resolver.resolveByEmail.mockRejectedValue(boom);
    const req: any = { query: { email: "x@y.com" } };
    const next = jest.fn();
    await middleware.use(req, {} as any, next);
    expect(next).toHaveBeenCalledWith(boom);
    expect(req.spotifyClient).toBeUndefined();
  });

  it("does nothing when neither state nor email is present (e.g. ?error= callback)", async () => {
    const req: any = { query: { error: "access_denied" } };
    const next = jest.fn();
    await middleware.use(req, {} as any, next);
    expect(req.spotifyClient).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});
