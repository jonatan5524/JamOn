import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "./user.entity";

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

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

  async updateLastUpdatedSongs(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastUpdatedSongs: new Date() });
  }

  async updateAppRefreshToken(
    userId: string,
    refreshToken: string | null,
  ): Promise<void> {
    await this.userRepository.update(userId, { appRefreshToken: refreshToken });
  }

  /**
   * Clears all session state on logout: the app refresh token plus the stored
   * Spotify credentials and client assignment. Profile fields are left intact.
   */
  async clearSessionTokens(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      appRefreshToken: null,
      spotifyAccessToken: null,
      spotifyRefreshToken: null,
      spotifyClientKey: null,
    });
  }

  async findById(userId: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { id: userId } });
  }

  async findByIdWithSpotifyToken(userId: string): Promise<User | null> {
    return await this.userRepository
      .createQueryBuilder("user")
      .where("user.id = :userId", { userId })
      .addSelect("user.spotifyAccessToken")
      .getOne();
  }
}
