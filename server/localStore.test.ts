import { describe, expect, it } from "vitest";
import {
  createConversation,
  createEmployee,
  createLocalSession,
  createLocalUser,
  getLocalSessionUser,
  listConversations,
  listOrders,
  loginLocalUser,
  replyToConversation,
  saveLocalOrder,
  seedLocalTestAccounts,
} from "./localStore";

const uniqueEmail = (label: string) =>
  `${label}-${crypto.randomUUID()}@example.test`;

describe("local accounts and support", () => {
  it("persists local accounts and only accepts a valid password", async () => {
    const email = uniqueEmail("reader");
    const customer = await createLocalUser({
      name: "Test Reader",
      email,
      password: "local-test-password-2026",
      role: "user",
    });
    const session = createLocalSession(customer.id);
    expect(getLocalSessionUser(session.token)).toMatchObject({
      id: customer.id,
      email,
      role: "user",
    });
    expect(await loginLocalUser(email, "incorrect-password")).toBeNull();
    expect(
      await loginLocalUser(email, "local-test-password-2026")
    ).toMatchObject({
      id: customer.id,
      role: "user",
    });
  });

  it("seeds hashed development accounts only when missing", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalPasswords = {
      admin: process.env.LOCAL_TEST_ADMIN_PASSWORD,
      employee: process.env.LOCAL_TEST_EMPLOYEE_PASSWORD,
      customer: process.env.LOCAL_TEST_CUSTOMER_PASSWORD,
    };
    process.env.NODE_ENV = "production";
    try {
      await expect(seedLocalTestAccounts()).resolves.toBe(0);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }

    process.env.LOCAL_TEST_ADMIN_PASSWORD = "seed-admin-test-password";
    process.env.LOCAL_TEST_EMPLOYEE_PASSWORD = "seed-employee-test-password";
    process.env.LOCAL_TEST_CUSTOMER_PASSWORD = "seed-customer-test-password";
    await seedLocalTestAccounts();

    const accounts = [
      ["admin@leaflore.com", "seed-admin-test-password", "admin"],
      ["employee@leaflore.com", "seed-employee-test-password", "employee"],
      ["customer@gmail.com", "seed-customer-test-password", "user"],
    ] as const;
    try {
      for (const [email, password, role] of accounts) {
        await expect(loginLocalUser(email, password)).resolves.toMatchObject({
          email,
          role,
        });
      }

      await expect(seedLocalTestAccounts()).resolves.toBe(0);
    } finally {
      if (originalPasswords.admin === undefined)
        delete process.env.LOCAL_TEST_ADMIN_PASSWORD;
      else process.env.LOCAL_TEST_ADMIN_PASSWORD = originalPasswords.admin;
      if (originalPasswords.employee === undefined)
        delete process.env.LOCAL_TEST_EMPLOYEE_PASSWORD;
      else process.env.LOCAL_TEST_EMPLOYEE_PASSWORD = originalPasswords.employee;
      if (originalPasswords.customer === undefined)
        delete process.env.LOCAL_TEST_CUSTOMER_PASSWORD;
      else process.env.LOCAL_TEST_CUSTOMER_PASSWORD = originalPasswords.customer;
    }
  });

  it("separates system and book-support queues and gives customers an FAQ reply", async () => {
    const customer = await createLocalUser({
      name: "Support Customer",
      email: uniqueEmail("support"),
      password: "local-test-password-2026",
      role: "user",
    });
    const employee = await createEmployee({
      name: "Support Employee",
      email: uniqueEmail("employee"),
      password: "employee-test-password-2026",
    });
    const admin = await createLocalUser({
      name: "Support Admin",
      email: uniqueEmail("admin"),
      password: "admin-test-password-2026",
      role: "admin",
    });
    const system = createConversation(
      customer,
      "system",
      "Checkout is broken",
      "The system has a bug"
    );
    const book = createConversation(
      customer,
      "books",
      "Where is my order?",
      "How many days for delivery?"
    );
    expect(
      system.messages.some(message => String(message.senderRole) === "bot")
    ).toBe(true);
    expect(
      book.messages.find(message => String(message.senderRole) === "bot")?.body
    ).toContain("3–7 business days");
    expect(
      listConversations(employee).map(conversation => conversation.id)
    ).toEqual([book.id]);
    expect(
      listConversations(admin).map(conversation => conversation.id)
    ).toEqual([system.id]);
    expect(listConversations(customer)).toHaveLength(2);
    expect(
      replyToConversation(employee, book.id, "Please share your order number")
        .messages
    ).toHaveLength(3);
    expect(listOrders(customer)).toEqual([]);
    saveLocalOrder({
      userId: customer.id,
      firstName: "Support",
      lastName: "Customer",
      email: customer.email,
      address: "1 Test Street",
      city: "Manila",
      postcode: "1000",
      items: [
        {
          bookId: "test-book",
          title: "Test Book",
          priceCents: 50000,
          quantity: 1,
        },
      ],
      subtotalCents: 50000,
      shippingCents: 9900,
      totalCents: 59900,
      estimatedDelivery: "2026-04-01",
    });
    expect(listOrders(customer)).toHaveLength(1);
    expect(listOrders(employee)).toHaveLength(1);
  });
});
