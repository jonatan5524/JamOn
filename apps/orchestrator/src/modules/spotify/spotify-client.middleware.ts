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
