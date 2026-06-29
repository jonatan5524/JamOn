import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { SpotifyModule } from "./modules/spotify/spotify.module";
import { PlaylistModule } from "./modules/playlist/playlist.module";
import { AuthModule } from "./modules/auth/auth.module";
import { EventModule } from "./modules/event/event.module";
import { UserModule } from "./modules/user/user.module";
import { SongModule } from "./modules/song/song.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./modules/user/user.entity";
import { DataSource } from "typeorm";
import { Event } from "./modules/event/event.entity";
import { EventParticipant } from "./modules/event/event-participant.entity";
import { Song } from "./modules/song/song.entity";
import { SongLike } from "./modules/song/song-like.entity";
import { EventPlaylistTrack } from "./modules/event/event-playlist-track.entity";
import { SpotifyClientAssignment } from "./modules/spotify/spotify-client-assignment.entity";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [User, Event, EventParticipant, EventPlaylistTrack, Song, SongLike, SpotifyClientAssignment],
        synchronize: true,
        autoLoadEntities: true
      }),
    }),
    SpotifyModule,
    PlaylistModule,
    AuthModule,
    EventModule,
    UserModule,
    SongModule
  ],
})
export class AppModule implements OnModuleInit { 
  private readonly DBLogger = new Logger('Database');

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    if (this.dataSource.isInitialized) {
      this.DBLogger.log('PostgreSQL connection established successfully');
    } else {
      this.DBLogger.error('Failed to connect to PostgreSQL');
    }
  }
}
