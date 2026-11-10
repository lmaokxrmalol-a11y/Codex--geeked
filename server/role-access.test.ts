import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  createLocalUser,
  getLocalSessionUser,
  listOrders,
  listTransactions,
} from "./localStore";
import { addToCart, getStoreState } from "./db";

afterEach(() => vi.unstubAllEnvs());

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

  it.each([
    ["user", "/"],
    ["employee", "/employee"],
    ["admin", "/admin"],
  ] as const)(
    "redirects a %s to its role-specific destination",
    async (role, redirectTo) => {
      const user = await createLocalUser({
        name: `Role Test ${role}`,
        email: `role-login-${crypto.randomUUID()}@example.test`,
        password: "role-login-password-2026",
        role,
      });
      const caller = appRouter.createCaller(createAnonymousContext());

      await expect(
        caller.auth.login({
          email: user.email,
          password: "role-login-password-2026",
        })
      ).resolves.toMatchObject({
        user: { role },
        redirectTo,
      });
    }
  );

  it("completes development checkout locally and records a transaction", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PAYMONGO_SECRET_KEY", "");
    const customer = await createLocalUser({
      name: "Checkout Customer",
      email: `checkout-${crypto.randomUUID()}@example.test`,
      password: "checkout-test-password",
      role: "user",
    });
    const sessionId = `checkout-${crypto.randomUUID()}`;
    await addToCart(sessionId, "project-hail-mary", 1);

    const result = await appRouter
      .createCaller(createContext(customer))
      .checkout.createOrder({
        sessionId,
        firstName: "Checkout",
        lastName: "Customer",
        email: customer.email,
        address: "12 Mabini Street",
        city: "Manila",
        postcode: "1000",
        paymentMethod: "gcash",
      });

    expect(result).toMatchObject({
      paymentMethod: "gcash",
      simulated: true,
      checkoutUrl: null,
    });
    expect(listOrders(customer)[0]).toMatchObject({
      id: result.orderId,
      status: "paid",
      paymentStatus: "completed",
      paymentMethod: "gcash",
    });
    expect(listTransactions(customer)[0]).toMatchObject({
      orderId: result.orderId,
      amountCents: result.totalCents,
      paymentMethod: "gcash",
      status: "completed",
    });
    expect((await getStoreState(sessionId)).cart).toEqual([]);
  });

  it("rejects direct sandbox checkout outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    const customer = await createLocalUser({
      name: "Sandbox Block Customer",
      email: `sandbox-${crypto.randomUUID()}@example.test`,
      password: "checkout-test-password",
      role: "user",
    });
    const sessionId = `sandbox-${crypto.randomUUID()}`;
    await addToCart(sessionId, "project-hail-mary", 1);

    await expect(
      appRouter.createCaller(createContext(customer)).checkout.createOrder({
        sessionId,
        firstName: "Sandbox",
        lastName: "Block",
        email: customer.email,
        address: "12 Mabini Street",
        city: "Manila",
        postcode: "1000",
        paymentMethod: "sandbox",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Direct Sandbox Test is available only in development",
    });
  });

  it("requires PayMongo for online checkout in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PAYMONGO_SECRET_KEY", "");
    const customer = await createLocalUser({
      name: "Production Checkout Customer",
      email: `production-checkout-${crypto.randomUUID()}@example.test`,
      password: "checkout-test-password",
      role: "user",
    });
    const sessionId = `production-checkout-${crypto.randomUUID()}`;
    await addToCart(sessionId, "project-hail-mary", 1);

    await expect(
      appRouter.createCaller(createContext(customer)).checkout.createOrder({
        sessionId,
        firstName: "Production",
        lastName: "Customer",
        email: customer.email,
        address: "12 Mabini Street",
        city: "Manila",
        postcode: "1000",
        paymentMethod: "gcash",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Payments are not configured"),
    });
    expect(listOrders(customer)).toEqual([]);
    expect((await getStoreState(sessionId)).cart).toHaveLength(1);
  });
});
