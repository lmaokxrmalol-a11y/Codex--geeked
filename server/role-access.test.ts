import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { createLocalUser, getLocalSessionUser } from "./localStore";

function createContext(user: NonNullable<TrpcContext["user"]>): TrpcContext {
  return {
    user,
    req: {
      protocol: "http",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: () => undefined,
      clearCookie: () => undefined,
    } as TrpcContext["res"],
  };
}

function createAnonymousContext(onCookie: (value: string) => void = () => {}) {
  return {
    user: null,
    req: {
      protocol: "http",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (_name: string, value: string) => onCookie(value),
      clearCookie: () => undefined,
    } as TrpcContext["res"],
  } as TrpcContext;
}

describe("role-based account procedures", () => {
  it("registers customers and issues a local HTTP-only session cookie", async () => {
    let sessionToken = "";
    let cookieOptions: Record<string, unknown> = {};
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "http",
        headers: {},
      } as TrpcContext["req"],
      res: {
        cookie: (
          _name: string,
          value: string,
          options: Record<string, unknown>
        ) => {
          sessionToken = value;
          cookieOptions = options;
        },
        clearCookie: () => undefined,
      } as TrpcContext["res"],
    };
    const customer = await appRouter.createCaller(ctx).auth.register({
      name: "Registered Customer",
      email: `register-${crypto.randomUUID()}@example.test`,
      password: "local-test-password-2026",
    });

    expect(customer.role).toBe("user");
    expect("passwordHash" in customer).toBe(false);
    expect(getLocalSessionUser(sessionToken)?.id).toBe(customer.id);
    expect(cookieOptions).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
  });

  it("allows only a local administrator to create employee accounts", async () => {
    const customer = await createLocalUser({
      name: "Role Test Customer",
      email: `role-customer-${crypto.randomUUID()}@example.test`,
      password: "local-test-password-2026",
      role: "user",
    });
    const admin = await createLocalUser({
      name: "Role Test Admin",
      email: `role-admin-${crypto.randomUUID()}@example.test`,
      password: "admin-test-password-2026",
      role: "admin",
    });

    await expect(
      appRouter.createCaller(createContext(customer)).auth.createEmployee({
        name: "Unauthorized Employee",
        email: `role-denied-${crypto.randomUUID()}@example.test`,
        password: "employee-test-password-2026",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      appRouter.createCaller(createContext(admin)).auth.createEmployee({
        name: "Authorized Employee",
        email: `role-employee-${crypto.randomUUID()}@example.test`,
        password: "employee-test-password-2026",
      })
    ).resolves.toMatchObject({ role: "employee" });
  });

  it("requires the selected sign-in type to match the account role", async () => {
    const employee = await createLocalUser({
      name: "Role-specific Employee",
      email: `role-login-${crypto.randomUUID()}@example.test`,
      password: "employee-login-password-2026",
      role: "employee",
    });
    const caller = appRouter.createCaller(createAnonymousContext());

    await expect(
      caller.auth.login({
        email: employee.email,
        password: "employee-login-password-2026",
        role: "user",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("employee"),
    });

    await expect(
      caller.auth.login({
        email: employee.email,
        password: "employee-login-password-2026",
        role: "employee",
      })
    ).resolves.toMatchObject({ role: "employee" });
  });
});
