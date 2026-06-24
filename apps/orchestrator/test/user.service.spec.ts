import { UserService } from "../src/modules/user/user.service";

describe("UserService.findOrCreateBySpotifyId", () => {
  const profile = { id: "spot1", email: "a@b.com", display_name: "A", images: [] };

  const makeRepo = (existing: any) => {
    const saved: any[] = [];
    return {
      saved,
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn(async (u: any) => {
        saved.push(u);
        return u;
      }),
    };
  };

  it("stores spotifyClientKey on a newly created user", async () => {
    const repo = makeRepo(null);
    const service = new UserService(repo as any);
    const user = await service.findOrCreateBySpotifyId(profile, "refresh", "access", "app3");
    expect(user.spotifyClientKey).toBe("app3");
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ spotifyClientKey: "app3" }),
    );
  });

  it("updates spotifyClientKey on an existing user", async () => {
    const existing = { spotifyId: "spot1", spotifyClientKey: "app1" };
    const repo = makeRepo(existing);
    const service = new UserService(repo as any);
    const user = await service.findOrCreateBySpotifyId(profile, "refresh", "access", "app2");
    expect(user.spotifyClientKey).toBe("app2");
  });
});
