import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import { Response } from "express";
import { ConfigService } from "@nestjs/config";

/**
 * Catches HttpExceptions thrown by the OAuth controller handlers (authorize /
 * callback) and redirects the browser to the frontend login page with an
 * ?error= message, instead of returning raw JSON. The frontend reads ?error=
 * and shows it in the login error banner. Covers the Spotify-deny, invalid-state
 * and token-exchange-failure cases that the user reaches via a full-page redirect.
 */
@Catch(HttpException)
export class AuthRedirectFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const clientUrl = this.configService.get<string>("CLIENT_URL") || "http://localhost:5173";

    const payload = exception.getResponse() as unknown;
    const message =
      typeof payload === "string"
        ? payload
        : (payload as { message?: string; error?: string })?.message ||
          (payload as { message?: string; error?: string })?.error ||
          "Login failed";

    const url = new URL(clientUrl);
    url.pathname = "/login";
    url.searchParams.set("error", message);

    res.redirect(url.toString());
  }
}
