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

  async isRegistered(email: string | undefined): Promise<boolean> {
    if (!email) {
      return false;
    }
    const normalized = email.trim().toLowerCase();
    const assignment = await this.assignmentRepo.findOne({ where: { email: normalized } });
    return assignment !== null;
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
