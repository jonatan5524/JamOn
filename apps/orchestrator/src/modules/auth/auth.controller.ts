import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { AuthService } from "./auth.service";
import { AuthCallbackDto } from "./dto/auth-callback.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("spotify/authorize")
  async authorizeSpotify(@Res() res: Response) {
    const { url } = this.authService.getAuthorizationUrl();
    res.redirect(url);
  }

  @Get("spotify/callback")
  async handleSpotifyCallback(
    @Query() query: AuthCallbackDto,
    @Res() res: Response,
  ) {
    const { code, error } = query;

    if (error) {
      throw new HttpException(
        { error: "Authorization denied or failed", details: error },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!code) {
      throw new HttpException(
        { error: "Missing authorization code" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const tokenResponse = await this.authService.exchangeCodeForToken(code);

    // Redirect to client with token in hash
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const redirectUrl = new URL(clientUrl);
    redirectUrl.hash = `access_token=${tokenResponse.access_token}&token_type=Bearer&expires_in=${tokenResponse.expires_in}`;

    res.redirect(redirectUrl.toString());
  }
}
