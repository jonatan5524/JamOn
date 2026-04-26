import {
  Controller,
  Get,
  Query,
  Res,
  Req,
  HttpException,
  HttpStatus,
  Post,
  HttpCode,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { AuthCallbackDto } from "./dto/auth-callback.dto";
import { ApiOperation, ApiTags, ApiResponse, ApiQuery } from "@nestjs/swagger";

const OAUTH_STATE_COOKIE = "spotify_oauth_state";

@ApiTags('Authentication') // קיבוץ תחת קטגוריית Auth ב-Swagger
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getCookie(req: Request, name: string): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    const cookiePrefix = `${name}=`;
    const cookie = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookiePrefix));

    return cookie ? decodeURIComponent(cookie.slice(cookiePrefix.length)) : null;
  }

  @Get("spotify/authorize")
  @ApiOperation({ 
    summary: 'Initiate the OAuth 2.0 flow to link a user’s Spotify account',
    description: 'Redirects the user to Spotify for authentication and sets a state cookie for security.'
  })
  @ApiResponse({ status: 302, description: 'Redirecting to Spotify authorization page.' })
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
  @ApiOperation({ 
    summary: 'Handle Spotify OAuth callback',
    description: 'Exchanges the authorization code for access tokens and redirects to the frontend client.'
  })
  @ApiQuery({ name: 'code', required: false, description: 'The authorization code returned from Spotify' })
  @ApiQuery({ name: 'state', required: false, description: 'The state string to prevent CSRF' })
  @ApiResponse({ status: 302, description: 'Redirecting back to client with access tokens.' })
  @ApiResponse({ status: 401, description: 'Authorization denied or failed.' })
  @ApiResponse({ status: 400, description: 'Missing code or invalid state.' })
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
    const redirectUrl = new URL(clientUrl);
    redirectUrl.pathname = "/login";
    redirectUrl.hash = `access_token=${tokenResponse.access_token}&token_type=Bearer&expires_in=${tokenResponse.expires_in}`;

    res.redirect(redirectUrl.toString());
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Invalidate session JWT and clear local tokens',
    description: 'Clears the current user session and authentication tokens.'
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  async logout() {
    return;
  }
}