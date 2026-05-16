import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET')!,
    });
    console.log('JWT strategy initialized');
    console.log(`JWT secret key: ${configService.get('JWT_SECRET')}`);
  }

  async validate(payload: any) {
    console.log(`Validating JWT payload for user: ${payload.userId}`);
    return { userId: payload.userId};
  }
}