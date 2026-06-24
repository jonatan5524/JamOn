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
      if (e.key.includes(":")) {
        // The key is embedded in the OAuth state as "<rand>:<key>"; a ":" in the
        // key would corrupt parsing on callback and misroute the token exchange.
        throw new Error(`SPOTIFY_CLIENTS key must not contain ":": "${e.key}"`);
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
