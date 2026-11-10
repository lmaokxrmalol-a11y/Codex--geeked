import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { getLocalSessionUser } from "../localStore";
import { sdk } from "./sdk";

export type AuthenticatedUser =
  | User
  | NonNullable<Awaited<ReturnType<typeof getLocalSessionUser>>>;

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AuthenticatedUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
  const localToken = cookies[COOKIE_NAME];
  if (localToken) {
    const localUser = getLocalSessionUser(localToken);
    if (localUser) {
      return { req: opts.req, res: opts.res, user: localUser };
    }
  }

  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
