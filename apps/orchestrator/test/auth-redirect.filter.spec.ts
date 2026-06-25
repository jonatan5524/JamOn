import { HttpException, HttpStatus } from "@nestjs/common";
import { AuthRedirectFilter } from "../src/modules/auth/auth-redirect.filter";

const makeHost = (res: { redirect: jest.Mock }) =>
  ({
    switchToHttp: () => ({ getResponse: () => res }),
  } as any);

const makeFilter = (clientUrl?: string) =>
  new AuthRedirectFilter({ get: () => clientUrl } as any);

describe("AuthRedirectFilter", () => {
  it("redirects to CLIENT_URL/login with the exception message as ?error=", () => {
    const res = { redirect: jest.fn() };
    const filter = makeFilter("https://app.example.com");

    filter.catch(
      new HttpException("Authorization denied or failed", HttpStatus.UNAUTHORIZED),
      makeHost(res),
    );

    expect(res.redirect).toHaveBeenCalledWith(
      "https://app.example.com/login?error=Authorization+denied+or+failed",
    );
  });

  it("pulls the message from an object response payload", () => {
    const res = { redirect: jest.fn() };
    const filter = makeFilter("https://app.example.com");

    filter.catch(
      new HttpException({ error: "Invalid OAuth state" }, HttpStatus.BAD_REQUEST),
      makeHost(res),
    );

    const target = res.redirect.mock.calls[0][0] as string;
    expect(target).toContain("/login?error=Invalid+OAuth+state");
  });

  it("falls back to localhost:5173 when CLIENT_URL is unset", () => {
    const res = { redirect: jest.fn() };
    const filter = makeFilter(undefined);

    filter.catch(new HttpException("Login failed", HttpStatus.BAD_GATEWAY), makeHost(res));

    const target = res.redirect.mock.calls[0][0] as string;
    expect(target).toContain("http://localhost:5173/login?error=");
  });
});
