import { SpotifyClientRegistry } from "../src/modules/spotify/spotify-client.registry";

const makeConfig = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] } as any);

describe("SpotifyClientRegistry", () => {
  const redirect = "http://localhost:3000/api/auth/spotify/callback";

  it("parses SPOTIFY_CLIENTS JSON and resolves by key", () => {
    const registry = new SpotifyClientRegistry(
      makeConfig({
        SPOTIFY_REDIRECT_URI: redirect,
        SPOTIFY_CLIENTS: JSON.stringify([
          { key: "app1", id: "id1", secret: "sec1" },
          { key: "app2", id: "id2", secret: "sec2" },
        ]),
      }),
    );
    expect(registry.getByKey("app2")).toEqual({
      key: "app2",
      clientId: "id2",
      clientSecret: "sec2",
      redirectUri: redirect,
    });
    expect(registry.all()).toHaveLength(2);
  });

  it("defaults to the first entry, overridable by SPOTIFY_DEFAULT_CLIENT_KEY", () => {
    const base = {
      SPOTIFY_REDIRECT_URI: redirect,
      SPOTIFY_CLIENTS: JSON.stringify([
        { key: "app1", id: "id1", secret: "sec1" },
        { key: "app2", id: "id2", secret: "sec2" },
      ]),
    };
    expect(new SpotifyClientRegistry(makeConfig(base)).getDefault().key).toBe("app1");
    expect(
      new SpotifyClientRegistry(
        makeConfig({ ...base, SPOTIFY_DEFAULT_CLIENT_KEY: "app2" }),
      ).getDefault().key,
    ).toBe("app2");
  });

  it("falls back to single-client env when SPOTIFY_CLIENTS is unset", () => {
    const registry = new SpotifyClientRegistry(
      makeConfig({
        SPOTIFY_REDIRECT_URI: redirect,
        SPOTIFY_CLIENT_ID: "legacy-id",
        SPOTIFY_CLIENT_SECRET: "legacy-secret",
      }),
    );
    expect(registry.getDefault()).toEqual({
      key: "default",
      clientId: "legacy-id",
      clientSecret: "legacy-secret",
      redirectUri: redirect,
    });
  });

  it("throws on malformed JSON", () => {
    expect(
      () => new SpotifyClientRegistry(makeConfig({ SPOTIFY_CLIENTS: "{not json" })),
    ).toThrow(/not valid JSON/);
  });

  it("throws on an entry missing required fields", () => {
    expect(
      () =>
        new SpotifyClientRegistry(
          makeConfig({ SPOTIFY_CLIENTS: JSON.stringify([{ key: "x", id: "" }]) }),
        ),
    ).toThrow(/missing key\/id\/secret/);
  });

  it("throws when a client key contains a colon (would corrupt OAuth state)", () => {
    expect(
      () =>
        new SpotifyClientRegistry(
          makeConfig({ SPOTIFY_CLIENTS: JSON.stringify([{ key: "app:eu", id: "i", secret: "s" }]) }),
        ),
    ).toThrow(/must not contain/);
  });

  it("throws when getByKey is called with an unknown key", () => {
    const registry = new SpotifyClientRegistry(
      makeConfig({ SPOTIFY_CLIENTS: JSON.stringify([{ key: "app1", id: "i", secret: "s" }]) }),
    );
    expect(() => registry.getByKey("nope")).toThrow(/Unknown Spotify client key/);
  });
});
