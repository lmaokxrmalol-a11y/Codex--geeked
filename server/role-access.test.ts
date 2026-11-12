import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  createLocalUser,
  getBuyerAnalytics,
  getLocalSessionUser,
  listEmployeeReports,
  listOrders,
  listTransactions,
} from "./localStore";
import { addToCart, getCatalogBook, getStoreState } from "./db";

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
  it("allows employees to restock books and exposes the updated stock publicly", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const employee = await createLocalUser({
      name: "Inventory Employee",
      email: `inventory-employee-${crypto.randomUUID()}@example.test`,
      password: "inventory-test-password",
      role: "employee",
    });
    const customer = await createLocalUser({
      name: "Inventory Customer",
      email: `inventory-customer-${crypto.randomUUID()}@example.test`,
      password: "inventory-test-password",
      role: "user",
    });
    const bookId = "the-map-of-small-things";
    const startingStock = (await getCatalogBook(bookId))?.stock;
    if (typeof startingStock !== "number")
      throw new Error("Book stock is missing");
    const employeeCaller = appRouter.createCaller(createContext(employee));
    const customerCaller = appRouter.createCaller(createContext(customer));

    await expect(
      employeeCaller.catalog.restockBook({ bookId, quantityToAdd: 5 })
    ).resolves.toEqual({ bookId, stock: startingStock + 5 });
    await expect(
      appRouter.createCaller(createContext(customer)).catalog.restockBook({
        bookId,
        quantityToAdd: 5,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getCatalogBook(bookId)).resolves.toMatchObject({
      id: bookId,
      stock: startingStock + 5,
    });
    const stockCheckBook = await getCatalogBook("project-hail-mary");
    if (!stockCheckBook || stockCheckBook.stock >= 20)
      throw new Error("Stock-check test book must have fewer than 20 copies");
    await expect(
      customerCaller.store.addToCart({
        sessionId: `inventory-cart-${crypto.randomUUID()}`,
        bookId: stockCheckBook.id,
        quantity: stockCheckBook.stock + 1,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `Only ${stockCheckBook.stock} copies are available`,
    });
  });

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

  it("isolates staff shopping and provides employee reports to authorized roles", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const employee = await createLocalUser({
      name: "Report Employee",
      email: `report-employee-${crypto.randomUUID()}@example.test`,
      password: "report-test-password-2026",
      role: "employee",
    });
    const admin = await createLocalUser({
      name: "Report Admin",
      email: `report-admin-${crypto.randomUUID()}@example.test`,
      password: "report-test-password-2026",
      role: "admin",
    });
    const customer = await createLocalUser({
      name: "Report Customer",
      email: `report-customer-${crypto.randomUUID()}@example.test`,
      password: "report-test-password-2026",
      role: "user",
    });
    const employeeCaller = appRouter.createCaller(createContext(employee));
    const adminCaller = appRouter.createCaller(createContext(admin));
    const customerCaller = appRouter.createCaller(createContext(customer));
    const reportText = `Restocked books ${crypto.randomUUID()}`;

    await expect(
      employeeCaller.reports.submit({ reportText })
    ).resolves.toMatchObject({
      employeeId: employee.id,
      employeeName: employee.name,
      employeeEmail: employee.email,
      reportText,
    });
    await expect(employeeCaller.reports.mine()).resolves.toMatchObject([
      { reportText, employeeId: employee.id },
    ]);
    const allReports = await adminCaller.reports.all();
    expect(allReports[0]).toMatchObject({
      reportText,
      employeeId: employee.id,
    });
    expect(allReports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reportText, employeeId: employee.id }),
      ])
    );
    await expect(
      customerCaller.reports.submit({ reportText })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      adminCaller.reports.submit({ reportText })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      customerCaller.admin.buyerAnalytics()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      employeeCaller.admin.buyerAnalytics()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(adminCaller.admin.buyerAnalytics()).resolves.toEqual({
      daily: expect.any(Number),
      monthly: expect.any(Number),
      yearly: expect.any(Number),
    });

    const existingOrders = listOrders(employee).length;
    await expect(
      employeeCaller.checkout.createOrder({
        sessionId: `staff-checkout-${crypto.randomUUID()}`,
        firstName: "Report",
        lastName: "Employee",
        email: employee.email,
        address: "12 Mabini Street",
        city: "Manila",
        postcode: "1000",
        paymentMethod: "gcash",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      employeeCaller.store.addToCart({
        sessionId: `staff-cart-${crypto.randomUUID()}`,
        bookId: "project-hail-mary",
        quantity: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listOrders(employee)).toHaveLength(existingOrders);
    expect(listEmployeeReports(employee)).toHaveLength(1);
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
    const bookId = "project-hail-mary";
    const startingStock = (await getCatalogBook(bookId))?.stock;
    if (typeof startingStock !== "number")
      throw new Error("Book stock is missing");
    const sessionId = `checkout-${crypto.randomUUID()}`;
    const buyersBefore = getBuyerAnalytics();
    await addToCart(sessionId, bookId, 1);

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
    expect((await getCatalogBook(bookId))?.stock).toBe(startingStock - 1);
    expect((await getStoreState(sessionId)).cart).toEqual([]);
    expect(getBuyerAnalytics()).toEqual({
      daily: buyersBefore.daily + 1,
      monthly: buyersBefore.monthly + 1,
      yearly: buyersBefore.yearly + 1,
    });

    const secondSessionId = `checkout-same-buyer-${crypto.randomUUID()}`;
    await addToCart(secondSessionId, "on-looking", 1);
    await appRouter
      .createCaller(createContext(customer))
      .checkout.createOrder({
        sessionId: secondSessionId,
        firstName: "Checkout",
        lastName: "Customer",
        email: customer.email,
        address: "12 Mabini Street",
        city: "Manila",
        postcode: "1000",
        paymentMethod: "gcash",
      });
    expect(getBuyerAnalytics()).toEqual({
      daily: buyersBefore.daily + 1,
      monthly: buyersBefore.monthly + 1,
      yearly: buyersBefore.yearly + 1,
    });
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
