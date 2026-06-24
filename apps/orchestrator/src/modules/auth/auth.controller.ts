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
  UseGuards,
  Body,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { AuthCallbackDto } from "./dto/auth-callback.dto";
import { AuthorizeQueryDto } from "./dto/authorize-query.dto";
import { ApiOperation, ApiTags, ApiResponse, ApiQuery, ApiBearerAuth, ApiBody } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";

const OAUTH_STATE_COOKIE = "spotify_oauth_state";

@ApiTags('Authentication')
@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) { }

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
    summary: "Initiate the OAuth 2.0 flow to link a user's Spotify account",
    description: 'Resolves the user\'s Spotify test app by email, then redirects to Spotify and sets a state cookie for security.'
  })
  @ApiQuery({ name: 'email', required: true, description: 'The tester\'s Spotify account email' })
  @ApiResponse({ status: 302, description: 'Redirecting to Spotify authorization page.' })
  @ApiResponse({ status: 400, description: 'Missing/invalid email or email not registered for testing.' })
  async authorizeSpotify(
    // _query drives @IsEmail validation + Swagger docs; the client is resolved
    // from the email by SpotifyClientMiddleware (which runs before this handler).
    @Query() _query: AuthorizeQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const client = req.spotifyClient;
    if (!client) {
      throw new HttpException({ error: "Unable to resolve Spotify client" }, HttpStatus.BAD_REQUEST);
    }

    const { url, state } = this.authService.getAuthorizationUrl(client);

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

    const client = req.spotifyClient;
    if (!client) {
      throw new HttpException({ error: "Unable to resolve Spotify client" }, HttpStatus.BAD_REQUEST);
    }

    const tokens = await this.authService.handleLogin(code, client);

    const clientUrl = this.configService.get('CLIENT_URL') || "http://localhost:5173";
    const redirectUrl = new URL(clientUrl);
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.append("appAccessToken", tokens.appAccessToken);
    redirectUrl.searchParams.append("appRefreshToken", tokens.appRefreshToken);

    res.redirect(redirectUrl.toString());
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Invalidate session JWT and clear local tokens',
    description: 'Clears the current user session and authentication tokens.'
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  async logout(@Req() req: any) {
    const userId = req.user.userId;
    await this.authService.handleLogout(userId);

    return { message: 'Logged out successfully' };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Refresh access token using a valid refresh token',
    description: 'Exchanges a valid refresh token for a new access token.'
  })
  @ApiBody({ schema: { type: 'object', properties: { refreshToken: { type: 'string' } }, required: ['refreshToken'] } })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token.' })
  async refresh(@Body('refreshToken') refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    return this.authService.refreshTokens(refreshToken);
  }
}