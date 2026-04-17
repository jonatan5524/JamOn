import {
  Controller,
  Get,
  Query,
  Res,
  Req,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { AuthCallbackDto } from "./dto/auth-callback.dto";

const OAUTH_STATE_COOKIE = "spotify_oauth_state";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getCookie(req: Request, name: string): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    const encodedName = `${name}=`;
    const cookie = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(encodedName));

    return cookie ? decodeURIComponent(cookie.slice(encodedName.length)) : null;
  }

  @Get("spotify/authorize")
  async authorizeSpotify(@Res() res: Response) {
    const { url, state } = this.authService.getAuthorizationUrl();
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(url);
  }

  @Get("spotify/callback")
  async handleSpotifyCallback(
    @Query() query: AuthCallbackDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { code, error, state } = query;

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

    const expectedState = this.getCookie(req, OAUTH_STATE_COOKIE);
    if (!state || !expectedState || state !== expectedState) {
      throw new HttpException(
        { error: "Invalid OAuth state" },
        HttpStatus.BAD_REQUEST,
      );
    }

    res.clearCookie(OAUTH_STATE_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    const tokenResponse = await this.authService.exchangeCodeForToken(code);

    // Redirect to client with token in hash
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const redirectUrl = new URL("/login", clientUrl);
    redirectUrl.hash = `access_token=${tokenResponse.access_token}&token_type=Bearer&expires_in=${tokenResponse.expires_in}`;

    res.redirect(redirectUrl.toString());
  }
}
