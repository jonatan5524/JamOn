# Multi-Client Spotify Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pool 6 Spotify developer apps behind the orchestrator so any of ~30 testers logs in via the app where their email is an allowlisted test user.

**Architecture:** A static env-loaded client **registry** (`SPOTIFY_CLIENTS` JSON) plus a manual DB **assignment** table (`email → clientKey`). A **resolver** service maps email (at `/authorize`) or OAuth `state` (at `/callback`) to one client's credentials. A thin **middleware** on the two auth routes attaches the resolved client to `req.spotifyClient`. The client identity rides through the OAuth round-trip inside `state` (`rand:clientKey`); the chosen client is persisted on the `User` row.

**Tech Stack:** NestJS 11, TypeORM 0.3 (Postgres), Jest + ts-jest, class-validator. Frontend: React + Vite (`apps/client`).

---

## Project constraints

- **No git operations by the executor.** Project CLAUDE.md forbids it. Each task ends with a **Checkpoint** where the *user* commits. Do not run `git`.
- All orchestrator paths below are relative to `apps/orchestrator/`.
- Run tests from `apps/orchestrator/` with `npm test`. Single file: `npx jest test/<file>.spec.ts`.

## File structure

| File | Responsibility |
|------|----------------|
| `src/modules/spotify/spotify-client.types.ts` *(new)* | `SpotifyClient` interface |
| `src/modules/spotify/spotify-client.registry.ts` *(new)* | Parse `SPOTIFY_CLIENTS` env; `getByKey` / `getDefault` / `all` |
| `src/modules/spotify/spotify-client-assignment.entity.ts` *(new)* | `email → clientKey` table |
| `src/modules/spotify/spotify-client.resolver.ts` *(new)* | `resolveByEmail` / `resolveByState` |
| `src/modules/spotify/spotify-client.middleware.ts` *(new)* | Set `req.spotifyClient` on auth routes |
| `src/types/express.d.ts` *(new)* | Augment `Express.Request.spotifyClient` |
| `src/modules/auth/dto/authorize-query.dto.ts` *(new)* | `{ email }` validated query |
| `src/modules/spotify/spotify.module.ts` | Register registry/resolver/middleware/entity, export |
| `src/modules/spotify/spotify.service.ts` | `getAppToken` → `registry.getDefault()` |
| `src/modules/auth/auth.service.ts` | Thread client through authorize/exchange/login |
| `src/modules/auth/auth.controller.ts` | Read `req.spotifyClient`, email DTO, cookie = full state |
| `src/modules/auth/auth.module.ts` | Apply middleware (`NestModule`) |
| `src/modules/user/user.entity.ts` | `+ spotifyClientKey` column |
| `src/modules/user/user.service.ts` | Persist `spotifyClientKey` at login |
| `src/app.module.ts` | Register assignment entity |
| `.env.example` | Document `SPOTIFY_CLIENTS`, `SPOTIFY_DEFAULT_CLIENT_KEY` |
| `apps/client/src/hooks/use-spotify-auth.ts` | `startSpotifyLogin(email)` |
| `apps/client/src/pages/Login.tsx` | Email input before the Spotify button |

---

## Task 1: Client types + registry

**Files:**
- Create: `src/modules/spotify/spotify-client.types.ts`
- Create: `src/modules/spotify/spotify-client.registry.ts`
- Test: `test/spotify-client.registry.spec.ts`
- Modify: `src/modules/spotify/spotify.module.ts`

- [ ] **Step 1: Write the type**

`src/modules/spotify/spotify-client.types.ts`:

```ts
export interface SpotifyClient {
  key: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}
```

- [ ] **Step 2: Write the failing test**

`test/spotify-client.registry.spec.ts`:

```ts
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

  it("throws when getByKey is called with an unknown key", () => {
    const registry = new SpotifyClientRegistry(
      makeConfig({ SPOTIFY_CLIENTS: JSON.stringify([{ key: "app1", id: "i", secret: "s" }]) }),
    );
    expect(() => registry.getByKey("nope")).toThrow(/Unknown Spotify client key/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest test/spotify-client.registry.spec.ts`
Expected: FAIL — cannot find module `spotify-client.registry`.

- [ ] **Step 4: Implement the registry**

`src/modules/spotify/spotify-client.registry.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SpotifyClient } from "./spotify-client.types";

@Injectable()
export class SpotifyClientRegistry {
  private readonly logger = new Logger(SpotifyClientRegistry.name);
  private readonly clients = new Map<string, SpotifyClient>();
  private defaultKey!: string;

  constructor(private readonly configService: ConfigService) {
    this.load();
  }

  private load(): void {
    const redirectUri = this.configService.get<string>("SPOTIFY_REDIRECT_URI") ?? "";
    const raw = this.configService.get<string>("SPOTIFY_CLIENTS");

    let entries: Array<{ key: string; id: string; secret: string }>;
    if (raw && raw.trim().length > 0) {
      try {
        entries = JSON.parse(raw);
      } catch (e) {
        throw new Error(`SPOTIFY_CLIENTS is not valid JSON: ${(e as Error).message}`);
      }
      if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error("SPOTIFY_CLIENTS must be a non-empty JSON array");
      }
    } else {
      entries = [
        {
          key: "default",
          id: this.configService.get<string>("SPOTIFY_CLIENT_ID") ?? "",
          secret: this.configService.get<string>("SPOTIFY_CLIENT_SECRET") ?? "",
        },
      ];
    }

    for (const e of entries) {
      if (!e.key || !e.id || !e.secret) {
        throw new Error(`SPOTIFY_CLIENTS entry missing key/id/secret: ${JSON.stringify(e)}`);
      }
      this.clients.set(e.key, {
        key: e.key,
        clientId: e.id,
        clientSecret: e.secret,
        redirectUri,
      });
    }

    this.defaultKey =
      this.configService.get<string>("SPOTIFY_DEFAULT_CLIENT_KEY") ?? entries[0].key;
    if (!this.clients.has(this.defaultKey)) {
      throw new Error(
        `SPOTIFY_DEFAULT_CLIENT_KEY "${this.defaultKey}" not found in SPOTIFY_CLIENTS`,
      );
    }
    this.logger.log(
      `Loaded ${this.clients.size} Spotify client(s), default="${this.defaultKey}"`,
    );
  }

  getByKey(key: string): SpotifyClient {
    const client = this.clients.get(key);
    if (!client) {
      throw new Error(`Unknown Spotify client key: "${key}"`);
    }
    return client;
  }

  getDefault(): SpotifyClient {
    return this.getByKey(this.defaultKey);
  }

  all(): SpotifyClient[] {
    return [...this.clients.values()];
  }
}
```

- [ ] **Step 5: Register the provider so the app still compiles**

In `src/modules/spotify/spotify.module.ts`, add the import and put the registry into providers + exports:

```ts
import { SpotifyClientRegistry } from './spotify-client.registry';
// ...
  providers: [SpotifyService, SpotifyClientRegistry],
  exports: [SpotifyService, SpotifyClientRegistry],
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest test/spotify-client.registry.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Checkpoint — you commit**

Tell the user: Task 1 done (registry + types, tests green). Ask them to commit.

---

## Task 2: Assignment entity + DB registration

**Files:**
- Create: `src/modules/spotify/spotify-client-assignment.entity.ts`
- Modify: `src/modules/spotify/spotify.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create the entity**

`src/modules/spotify/spotify-client-assignment.entity.ts`:

```ts
import { Entity, PrimaryColumn, Column, CreateDateColumn } from "typeorm";

@Entity("spotify_client_assignments")
export class SpotifyClientAssignment {
  @PrimaryColumn()
  email!: string; // always stored lowercased

  @Column()
  clientKey!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
```

- [ ] **Step 2: Register the entity for repository injection**

In `src/modules/spotify/spotify.module.ts`, import `TypeOrmModule` and the entity, then add `forFeature` to imports:

```ts
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpotifyClientAssignment } from './spotify-client-assignment.entity';
// ...
  imports: [
    ConfigModule,
    HttpModule.register({ baseURL: SPOTIFY_API_BASE_URL }),
    TypeOrmModule.forFeature([SpotifyClientAssignment]),
  ],
```

- [ ] **Step 3: Register the entity with the root data source**

In `src/app.module.ts`, import the entity and add it to the `entities` array in the TypeORM `useFactory` (the array currently ends `...EventPlaylistTrack, Song, SongLike]`):

```ts
import { SpotifyClientAssignment } from "./modules/spotify/spotify-client-assignment.entity";
// ...
        entities: [User, Event, EventParticipant, EventPlaylistTrack, Song, SongLike, SpotifyClientAssignment],
```

- [ ] **Step 4: Build to verify wiring compiles**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Checkpoint — you commit**

Tell the user: Task 2 done (assignment entity + registration, build green). Note: `synchronize: true` will auto-create the `spotify_client_assignments` table on next boot. Ask them to commit.

---

## Task 3: Resolver service

**Files:**
- Create: `src/modules/spotify/spotify-client.resolver.ts`
- Test: `test/spotify-client.resolver.spec.ts`
- Modify: `src/modules/spotify/spotify.module.ts`

- [ ] **Step 1: Write the failing test**

`test/spotify-client.resolver.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest test/spotify-client.resolver.spec.ts`
Expected: FAIL — cannot find module `spotify-client.resolver`.

- [ ] **Step 3: Implement the resolver**

`src/modules/spotify/spotify-client.resolver.ts`:

```ts
import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SpotifyClient } from "./spotify-client.types";
import { SpotifyClientRegistry } from "./spotify-client.registry";
import { SpotifyClientAssignment } from "./spotify-client-assignment.entity";

@Injectable()
export class SpotifyClientResolver {
  private readonly logger = new Logger(SpotifyClientResolver.name);

  constructor(
    @InjectRepository(SpotifyClientAssignment)
    private readonly assignmentRepo: Repository<SpotifyClientAssignment>,
    private readonly registry: SpotifyClientRegistry,
  ) {}

  async resolveByEmail(email: string | undefined): Promise<SpotifyClient> {
    if (!email) {
      throw new HttpException("Missing email", HttpStatus.BAD_REQUEST);
    }
    const normalized = email.trim().toLowerCase();
    const assignment = await this.assignmentRepo.findOne({ where: { email: normalized } });
    if (!assignment) {
      throw new HttpException(
        "This email is not registered for testing. Contact the team to be added.",
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.toClient(assignment.clientKey);
  }

  resolveByState(state: string): SpotifyClient {
    const clientKey = state.split(":")[1];
    if (!clientKey) {
      throw new HttpException("Malformed OAuth state", HttpStatus.BAD_REQUEST);
    }
    return this.toClient(clientKey);
  }

  private toClient(clientKey: string): SpotifyClient {
    try {
      return this.registry.getByKey(clientKey);
    } catch (e) {
      this.logger.error((e as Error).message);
      throw new HttpException("Unknown Spotify client", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
```

- [ ] **Step 4: Register the provider**

In `src/modules/spotify/spotify.module.ts`, add to providers + exports:

```ts
import { SpotifyClientResolver } from './spotify-client.resolver';
// ...
  providers: [SpotifyService, SpotifyClientRegistry, SpotifyClientResolver],
  exports: [SpotifyService, SpotifyClientRegistry, SpotifyClientResolver],
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest test/spotify-client.resolver.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Checkpoint — you commit**

Tell the user: Task 3 done (resolver, tests green). Ask them to commit.

---

## Task 4: Request augmentation + middleware

**Files:**
- Create: `src/types/express.d.ts`
- Create: `src/modules/spotify/spotify-client.middleware.ts`
- Test: `test/spotify-client.middleware.spec.ts`
- Modify: `src/modules/spotify/spotify.module.ts`

- [ ] **Step 1: Augment the Express Request type**

`src/types/express.d.ts`:

```ts
import { SpotifyClient } from "../modules/spotify/spotify-client.types";

declare global {
  namespace Express {
    interface Request {
      spotifyClient?: SpotifyClient;
    }
  }
}

export {};
```

- [ ] **Step 2: Write the failing test**

`test/spotify-client.middleware.spec.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest test/spotify-client.middleware.spec.ts`
Expected: FAIL — cannot find module `spotify-client.middleware`.

- [ ] **Step 4: Implement the middleware**

`src/modules/spotify/spotify-client.middleware.ts`:

```ts
import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { SpotifyClientResolver } from "./spotify-client.resolver";

@Injectable()
export class SpotifyClientMiddleware implements NestMiddleware {
  constructor(private readonly resolver: SpotifyClientResolver) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const state = req.query.state as string | undefined;
      const email = req.query.email as string | undefined;

      if (state) {
        req.spotifyClient = this.resolver.resolveByState(state);
      } else if (email !== undefined) {
        req.spotifyClient = await this.resolver.resolveByEmail(email);
      }
      // Neither present (e.g. callback with ?error=): leave unset; controller handles.
      next();
    } catch (err) {
      next(err as Error);
    }
  }
}
```

- [ ] **Step 5: Register the middleware as a provider + export**

In `src/modules/spotify/spotify.module.ts`:

```ts
import { SpotifyClientMiddleware } from './spotify-client.middleware';
// ...
  providers: [SpotifyService, SpotifyClientRegistry, SpotifyClientResolver, SpotifyClientMiddleware],
  exports: [SpotifyService, SpotifyClientRegistry, SpotifyClientResolver, SpotifyClientMiddleware],
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest test/spotify-client.middleware.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Checkpoint — you commit**

Tell the user: Task 4 done (middleware + Request augmentation, tests green). Ask them to commit.

---

## Task 5: `getAppToken` uses the default client

**Files:**
- Modify: `src/modules/spotify/spotify.service.ts:24-36`
- Test: `test/spotify.service.spec.ts`

- [ ] **Step 1: Update the existing test to provide the registry and assert default-client creds**

In `test/spotify.service.spec.ts`, add the registry provider to the testing module and a test for `getAppToken`. Add the import near the top:

```ts
import { SpotifyClientRegistry } from '../src/modules/spotify/spotify-client.registry';
```

Add this provider inside the `providers: [...]` array (after the `ConfigService` provider):

```ts
        {
          provide: SpotifyClientRegistry,
          useValue: {
            getDefault: jest.fn(() => ({
              key: 'default',
              clientId: 'test-client-id',
              clientSecret: 'test-client-secret',
              redirectUri: 'http://localhost:3000/api/auth/spotify/callback',
            })),
          },
        },
```

Add this test (new `describe` block):

```ts
  describe('getAppToken', () => {
    it('requests a client_credentials token using the default client', async () => {
      httpService.post = jest.fn().mockReturnValue(of(
        mockAxiosResponse({ access_token: 'app-token' }),
      )) as any;

      const token = await service.getAppToken();

      expect(token).toBe('app-token');
      const expectedAuth = 'Basic ' + Buffer.from('test-client-id:test-client-secret').toString('base64');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: expectedAuth }),
        }),
      );
    });
  });
```

Note: the existing testing module mocks `HttpService` with only `{ request: jest.fn() }`. The test above assigns `service`'s `httpService.post` via the mock object — to make `post` mockable, also add `post: jest.fn()` to the `HttpService` `useValue`:

```ts
        {
          provide: HttpService,
          useValue: {
            request: jest.fn(),
            post: jest.fn(),
          },
        },
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest test/spotify.service.spec.ts -t getAppToken`
Expected: FAIL — `SpotifyClientRegistry` cannot be resolved / `getAppToken` still reads `ConfigService`.

- [ ] **Step 3: Update `getAppToken` to use the registry**

In `src/modules/spotify/spotify.service.ts`, import the registry and inject it, then read creds from `getDefault()`:

```ts
import { SpotifyClientRegistry } from './spotify-client.registry';
// ...
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly clientRegistry: SpotifyClientRegistry,
  ) {}

  getAppToken = async (): Promise<string> => {
    const { clientId, clientSecret } = this.clientRegistry.getDefault();
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const { data } = await firstValueFrom(
      this.httpService.post<{ access_token: string }>(
        'https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );
    return data.access_token;
  };
```

(`ConfigService` stays injected — still referenced elsewhere is not required, but leaving it avoids touching the constructor wiring further. It is now unused by `getAppToken`; that is fine.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest test/spotify.service.spec.ts`
Expected: PASS (all existing tests + new `getAppToken`).

- [ ] **Step 5: Checkpoint — you commit**

Tell the user: Task 5 done (`getAppToken` → default client). Ask them to commit.

---

## Task 6: User entity column + persist clientKey

**Files:**
- Modify: `src/modules/user/user.entity.ts`
- Modify: `src/modules/user/user.service.ts:13-39`
- Test: `test/user.service.spec.ts` *(new)*

- [ ] **Step 1: Add the column to the entity**

In `src/modules/user/user.entity.ts`, after the `spotifyAccessToken` column add:

```ts
    @Column({ nullable: true, select: false })
    spotifyClientKey?: string;
```

- [ ] **Step 2: Write the failing test**

`test/user.service.spec.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest test/user.service.spec.ts`
Expected: FAIL — `findOrCreateBySpotifyId` takes 3 args / does not set `spotifyClientKey`.

- [ ] **Step 4: Add the parameter and persist it**

In `src/modules/user/user.service.ts`, change the signature and both branches:

```ts
  async findOrCreateBySpotifyId(
    spotifyProfile: any,
    spotifyRefreshToken: string,
    spotifyAccessToken: string,
    spotifyClientKey: string,
  ): Promise<User> {
    const { id, email, display_name, images } = spotifyProfile;

    let user = await this.userRepository.findOne({ where: { spotifyId: id } });

    if (!user) {
      user = this.userRepository.create({
        spotifyId: id,
        email: email,
        displayName: display_name,
        profileImage: images?.[0]?.url,
        spotifyRefreshToken: spotifyRefreshToken,
        spotifyAccessToken: spotifyAccessToken,
        spotifyClientKey: spotifyClientKey,
      });
    } else {
      user.displayName = display_name;
      user.profileImage = images?.[0]?.url;
      user.spotifyRefreshToken = spotifyRefreshToken;
      user.spotifyAccessToken = spotifyAccessToken;
      user.spotifyClientKey = spotifyClientKey;
    }

    return await this.userRepository.save(user);
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest test/user.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Checkpoint — you commit**

Tell the user: Task 6 done (`spotifyClientKey` column + persistence). Ask them to commit.

---

## Task 7: AuthService threads the client through

**Files:**
- Modify: `src/modules/auth/auth.service.ts:34-66, 106-155`
- Test: `test/auth.service.spec.ts`

- [ ] **Step 1: Update the existing tests for the new signatures**

In `test/auth.service.spec.ts`:

Add an import for the type:

```ts
import { SpotifyClient } from "../src/modules/spotify/spotify-client.types";
```

Add a shared fixture inside the `describe("AuthService", ...)` block (above `beforeEach`):

```ts
  const client: SpotifyClient = {
    key: "app1",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    redirectUri: "http://localhost:3000/api/auth/spotify/callback",
  };
```

Replace the `getAuthorizationUrl` test body so it passes `client` and asserts the `state` shape:

```ts
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
```

Delete the `describe("configuration", ...)` block entirely (it asserted `ConfigService.get` was called for the Spotify creds, which no longer happens).

Update the `exchangeCodeForToken` happy-path call to pass `client`:

```ts
      const result = await service.exchangeCodeForToken("auth-code", client);
```

Update the error-path call too:

```ts
        await service.exchangeCodeForToken("bad-code", client);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest test/auth.service.spec.ts`
Expected: FAIL — `getAuthorizationUrl` / `exchangeCodeForToken` signatures differ.

- [ ] **Step 3: Update AuthService**

In `src/modules/auth/auth.service.ts`:

Add the import:

```ts
import { SpotifyClient } from "../spotify/spotify-client.types";
```

Change `handleLogin` to accept and thread the client:

```ts
  async handleLogin(code: string, client: SpotifyClient) {
    const spotifyTokens = await this.exchangeCodeForToken(code, client);

    const spotifyProfile = await this.getSpotifyProfile(spotifyTokens.access_token);

    const user = await this.userService.findOrCreateBySpotifyId(
      spotifyProfile,
      spotifyTokens.refresh_token,
      spotifyTokens.access_token,
      client.key,
    );

    const payload = { userId: user.id };

    const appAccessToken = this.jwtService.sign(payload, { expiresIn: '1h' });
    const appRefreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    await this.userService.updateAppRefreshToken(user.id, appRefreshToken);

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (!user.lastUpdatedSongs || user.lastUpdatedSongs < oneWeekAgo) {
      this.triggerLibrarySync(spotifyTokens.access_token, user.id);
    }

    return {
      appAccessToken,
      appRefreshToken,
      spotifyAccessToken: spotifyTokens.access_token,
    };
  }
```

Replace `getAuthorizationUrl` (now takes a client, builds `rand:key` state):

```ts
  getAuthorizationUrl(client: SpotifyClient): { url: string; state: string } {
    const scopes = [
      "playlist-modify-public",
      "playlist-modify-private",
      "user-read-private",
      "user-read-email",
      "user-top-read",
    ];
    const state = `${randomBytes(16).toString("hex")}:${client.key}`;

    const params = new URLSearchParams({
      client_id: client.clientId,
      response_type: 'code',
      redirect_uri: client.redirectUri,
      scope: scopes.join(" "),
      state: state,
      show_dialog: "true",
    });

    this.logger.log(`Generated authorization URL for Spotify client "${client.key}"`);

    return { url: `https://accounts.spotify.com/authorize?${params.toString()}`, state };
  }
```

Replace `exchangeCodeForToken` (now takes a client):

```ts
  async exchangeCodeForToken(code: string, client: SpotifyClient): Promise<SpotifyTokenResponse> {
    this.logger.log("Exchanging authorization code for access token");
    try {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: client.redirectUri,
        client_id: client.clientId,
        client_secret: client.clientSecret,
      });

      const { data } = await firstValueFrom(
        this.httpService.post<SpotifyTokenResponse>(
          "https://accounts.spotify.com/api/token",
          params.toString(),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        )
      );

      this.logger.log("Successfully exchanged code for access token");
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to exchange code: ${error.message}`);
      throw new HttpException("Failed to exchange token", HttpStatus.BAD_GATEWAY);
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest test/auth.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint — you commit**

Tell the user: Task 7 done (AuthService threads the client). Ask them to commit.

---

## Task 8: AuthController + DTO + middleware wiring

**Files:**
- Create: `src/modules/auth/dto/authorize-query.dto.ts`
- Modify: `src/modules/auth/auth.controller.ts:47-121`
- Modify: `src/modules/auth/auth.module.ts`

- [ ] **Step 1: Create the authorize query DTO**

`src/modules/auth/dto/authorize-query.dto.ts`:

```ts
import { IsEmail } from "class-validator";

export class AuthorizeQueryDto {
  @IsEmail()
  email!: string;
}
```

- [ ] **Step 2: Update the authorize handler to use `req.spotifyClient` and the DTO**

In `src/modules/auth/auth.controller.ts`, add the import:

```ts
import { AuthorizeQueryDto } from "./dto/authorize-query.dto";
```

Replace the `authorizeSpotify` method. It now validates `email` (DTO), reads the client the middleware resolved, and stores the **full** state in the CSRF cookie:

```ts
  @Get("spotify/authorize")
  @ApiOperation({
    summary: 'Initiate the OAuth 2.0 flow to link a user’s Spotify account',
    description: 'Resolves the user’s Spotify test app by email, then redirects to Spotify.'
  })
  @ApiQuery({ name: 'email', required: true, description: 'The tester’s Spotify account email' })
  @ApiResponse({ status: 302, description: 'Redirecting to Spotify authorization page.' })
  @ApiResponse({ status: 400, description: 'Missing/invalid email or email not registered for testing.' })
  async authorizeSpotify(
    @Query() _query: AuthorizeQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const client = req.spotifyClient!; // guaranteed by SpotifyClientMiddleware for a registered email
    const { url, state } = this.authService.getAuthorizationUrl(client);

    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000,
    });

    res.redirect(url);
  }
```

- [ ] **Step 3: Update the callback handler to pass the resolved client**

In the same file, in `handleSpotifyCallback`, the CSRF check (`state !== expectedState`) stays exactly as-is (full-string equality). Only change the `handleLogin` call to pass the middleware-resolved client:

```ts
    const tokens = await this.authService.handleLogin(code, req.spotifyClient!);
```

(The middleware set `req.spotifyClient` from `state` before the handler ran. The existing `error` / missing-`code` / state-mismatch guards above this line are unchanged.)

- [ ] **Step 4: Apply the middleware in AuthModule**

Replace `src/modules/auth/auth.module.ts` with the `NestModule` version:

```ts
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UserModule } from "../user/user.module";
import { JwtModule } from "@nestjs/jwt";
import { JwtStrategy } from "./jwt.strategy";
import { SpotifyModule } from "../spotify/spotify.module";
import { SpotifyClientMiddleware } from "../spotify/spotify-client.middleware";
import { DataEngineModule } from "../data-engine/data-engine.module";
import { SongModule } from "../song/song.module";

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    UserModule,
    SpotifyModule,
    DataEngineModule,
    SongModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SpotifyClientMiddleware)
      .forRoutes(
        { path: "api/auth/spotify/authorize", method: RequestMethod.GET },
        { path: "api/auth/spotify/callback", method: RequestMethod.GET },
      );
  }
}
```

- [ ] **Step 5: Build and run the full orchestrator suite**

Run: `npm run build && npm test`
Expected: build succeeds; all spec files pass (registry, resolver, middleware, spotify.service, user.service, auth.service, plus the pre-existing playlist/ai specs).

- [ ] **Step 6: Manual smoke test (optional but recommended)**

With a populated `.env` (see Task 10) and DB running:
1. `INSERT INTO spotify_client_assignments (email, "clientKey", "createdAt") VALUES ('you@example.com', 'app1', now());`
2. Start: `npm run start:dev`.
3. Hit `GET http://localhost:3000/api/auth/spotify/authorize?email=you@example.com` → expect a 302 to `accounts.spotify.com` whose `client_id` matches `app1` and whose `state` ends `:app1`.
4. Hit the same with an unregistered email → expect `400` "not registered for testing".

- [ ] **Step 7: Checkpoint — you commit**

Tell the user: Task 8 done (controller + DTO + middleware wired, full suite green). Ask them to commit.

---

## Task 9: Frontend — email before the Spotify button

**Files:**
- Modify: `apps/client/src/hooks/use-spotify-auth.ts:44-53`
- Modify: `apps/client/src/pages/Login.tsx`

No test runner is configured in `apps/client` — verify manually in the browser.

- [ ] **Step 1: Make `startSpotifyLogin` take an email**

In `apps/client/src/hooks/use-spotify-auth.ts`, change `startSpotifyLogin`:

```ts
  const startSpotifyLogin = useCallback((email: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const url = `${API_URL}/auth/spotify/authorize?email=${encodeURIComponent(email)}`;
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setIsLoading(false);
    }
  }, []);
```

- [ ] **Step 2: Add the email input to the Login page**

In `apps/client/src/pages/Login.tsx`:

Add `useState` to the React import and a local email state + validity flag:

```ts
import { useEffect, useState } from "react";
```

Inside the component, after the `useSpotifyAuth()` destructure:

```ts
  const [email, setEmail] = useState("");
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
```

Add the input immediately above the `<Button>` (between the `{error && ...}` block and the button):

```tsx
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Your Spotify account email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
            />
```

Change the button to pass the email and disable until valid:

```tsx
            <Button
              variant="glow"
              size="xl"
              onClick={() => startSpotifyLogin(email)}
              disabled={isLoading || !isValidEmail}
              className="w-full border-none bg-[#1DB954] text-white hover:bg-[#1ed760] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SpotifyMark className="mr-3 h-6 w-6" />
              {isLoading ? "Redirecting to Spotify..." : "Continue with Spotify"}
            </Button>
```

- [ ] **Step 3: Build the client to verify it compiles**

Run: `cd apps/client && npm run build`
Expected: Vite/tsc build succeeds.

- [ ] **Step 4: Manual verification**

Run `npm run dev` in `apps/client`. On `/login`:
- Button disabled until a valid email is typed.
- Typing a registered email + clicking → browser navigates to Spotify consent.
- An unregistered email → after redirect, the orchestrator returns 400; confirm the error surfaces (Spotify never loads).

- [ ] **Step 5: Checkpoint — you commit**

Tell the user: Task 9 done (frontend email input). Ask them to commit.

---

## Task 10: Document env + ops

**Files:**
- Modify: `apps/orchestrator/.env.example`

- [ ] **Step 1: Document the new env vars**

In `apps/orchestrator/.env.example`, below the existing `SPOTIFY_*` lines, add:

```bash
# Multi-client pooling: JSON array of the team's Spotify test apps.
# When set, this REPLACES single-client SPOTIFY_CLIENT_ID/SECRET for the OAuth
# login flow. SPOTIFY_REDIRECT_URI is shared across every app (register the same
# callback URL in each app's dashboard).
SPOTIFY_CLIENTS=[{"key":"app1","id":"xxx","secret":"yyy"},{"key":"app2","id":"xxx","secret":"yyy"}]
# Which client key is used for app-level calls (chart fetch). Defaults to the first entry.
SPOTIFY_DEFAULT_CLIENT_KEY=app1
```

- [ ] **Step 2: Add an ops note for assignments**

Append to `apps/orchestrator/.env.example` (as a comment) the manual assignment recipe so the team knows the routing step:

```bash
# To onboard a tester: (1) add their Spotify email as a test user in ONE app's
# Spotify dashboard, then (2) record the mapping in the DB:
#   INSERT INTO spotify_client_assignments (email, "clientKey", "createdAt")
#   VALUES ('tester@example.com', 'app1', now());
```

- [ ] **Step 3: Checkpoint — you commit**

Tell the user: Task 10 done (env + ops docs). Ask them to commit. Feature complete.

---

## Self-review notes (verified against the spec)

- **Spec §1 registry (env JSON + single-client fallback + default key):** Task 1.
- **Spec §2 assignment table (manual):** Tasks 2 (entity) + 10 (ops recipe).
- **Spec §3 resolver (`resolveByEmail`/`resolveByState`/`getByKey`/`getDefault`):** Tasks 1 (registry `getByKey`/`getDefault`) + 3 (resolver).
- **Spec §4 state `rand:clientKey`, cookie = full state, equality CSRF check:** Tasks 7 (state build) + 8 (cookie + unchanged CSRF check).
- **Spec §5 middleware on the 2 auth routes:** Tasks 4 (middleware) + 8 (wiring).
- **Spec §6 consuming client (authorize/exchange/login + `User.spotifyClientKey`):** Tasks 6, 7, 8.
- **Spec §7 authorize DTO + frontend email:** Tasks 8 (DTO) + 9 (frontend).
- **`getAppToken` → default client:** Task 5.
- **Out of scope (token refresh, auto-assign):** not implemented, by design.
