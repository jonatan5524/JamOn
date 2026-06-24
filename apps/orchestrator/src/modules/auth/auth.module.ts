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
