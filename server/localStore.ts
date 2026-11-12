import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { books as seedBooks, type Book } from "../shared/books";
import type { CheckoutPaymentMethod } from "../shared/payments";

const scrypt = promisify(scryptCallback);
const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite"
) as typeof import("node:sqlite");
const databasePath =
  process.env.LOCAL_DB_PATH ?? join(process.cwd(), ".data", "leaflore.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS local_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'employee', 'admin')),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_signed_in TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS local_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS support_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES local_users(id),
    channel TEXT NOT NULL CHECK (channel IN ('system', 'books')),
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES local_users(id),
    sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'employee', 'admin', 'bot')),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS local_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES local_users(id),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    postcode TEXT NOT NULL,
    items_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'fulfilled', 'cancelled')),
    subtotal_cents INTEGER NOT NULL,
    shipping_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    estimated_delivery TEXT NOT NULL,
    payment_method TEXT,
    payment_session_id TEXT,
    checkout_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS employee_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    employee_email TEXT NOT NULL,
    report_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS local_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE REFERENCES local_orders(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS local_inventory (
    book_id TEXT PRIMARY KEY,
    stock INTEGER NOT NULL DEFAULT 10 CHECK (stock >= 0)
  );
  INSERT INTO local_transactions (order_id, amount_cents, payment_method, status, created_at)
    SELECT id, total_cents, COALESCE(payment_method, 'unknown'),
      CASE status WHEN 'paid' THEN 'completed' WHEN 'cancelled' THEN 'cancelled' ELSE 'pending' END,
      created_at
    FROM local_orders
    WHERE NOT EXISTS (
      SELECT 1 FROM local_transactions WHERE local_transactions.order_id = local_orders.id
    );
`);

const seedInventory = database.prepare(
  "INSERT OR IGNORE INTO local_inventory (book_id, stock) VALUES (?, 10)"
);
for (const book of seedBooks) seedInventory.run(book.id);

export function listLocalInventory(): Array<Book & { stock: number }> {
  const rows = database
    .prepare("SELECT book_id, stock FROM local_inventory")
    .all() as Array<{ book_id: string; stock: number }>;
  const stockById = new Map(rows.map(row => [row.book_id, Number(row.stock)]));
  return seedBooks.map(book => ({
    ...book,
    slug: book.slug ?? book.id,
    stock: stockById.get(book.id) ?? 10,
  }));
}

export function getLocalBookStock(bookId: string) {
  const row = database
    .prepare("SELECT stock FROM local_inventory WHERE book_id = ?")
    .get(bookId) as { stock: number } | undefined;
  return row ? Number(row.stock) : null;
}

export function restockLocalBook(bookId: string, quantityToAdd: number) {
  const result = database
    .prepare("UPDATE local_inventory SET stock = stock + ? WHERE book_id = ?")
    .run(quantityToAdd, bookId);
  if (Number(result.changes) === 0) throw new Error("Book not found");
  return getLocalBookStock(bookId);
}

function deductLocalInventory(items: LocalOrderItem[]) {
  const updateStock = database.prepare(
    "UPDATE local_inventory SET stock = stock - ? WHERE book_id = ? AND stock >= ?"
  );
  for (const item of items) {
    const result = updateStock.run(item.quantity, item.bookId, item.quantity);
    if (Number(result.changes) !== 1) {
      const available = getLocalBookStock(item.bookId) ?? 0;
      throw new Error(
        `Only ${available} copies of ${item.title} are available`
      );
    }
  }
}

export type LocalRole = "user" | "employee" | "admin";
export type LocalUser = {
  id: number;
  openId: string;
  name: string;
  email: string;
  loginMethod: "local";
  role: LocalRole;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

function toLocalUser(row: Record<string, unknown>): LocalUser {
  const id = Number(row.id);
  const createdAt = new Date(String(row.created_at));
  const lastSignedIn = new Date(String(row.last_signed_in));
  return {
    id,
    openId: `local_${id}`,
    name: String(row.name),
    email: String(row.email),
    loginMethod: "local",
    role: row.role as LocalRole,
    createdAt,
    updatedAt: createdAt,
    lastSignedIn,
  };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length
  )) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function findUser(id: number) {
  const row = database
    .prepare("SELECT * FROM local_users WHERE id = ?")
    .get(id);
  return row ? toLocalUser(row as Record<string, unknown>) : null;
}

function findUserByEmail(email: string) {
  const row = database
    .prepare("SELECT * FROM local_users WHERE email = ? COLLATE NOCASE")
    .get(email.trim());
  return row ? toLocalUser(row as Record<string, unknown>) : null;
}

export async function createLocalUser(input: {
  email: string;
  name: string;
  password: string;
  role: LocalRole;
}) {
  const passwordHash = await hashPassword(input.password);
  try {
    const result = database
      .prepare(
        "INSERT INTO local_users (email, name, role, password_hash) VALUES (?, ?, ?, ?)"
      )
      .run(
        input.email.trim().toLowerCase(),
        input.name.trim(),
        input.role,
        passwordHash
      );
    const user = findUser(Number(result.lastInsertRowid));
    if (!user) throw new Error("Could not create account");
    return user;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      throw new Error("An account with that email already exists");
    }
    throw error;
  }
}

export async function seedLocalTestAccounts() {
  if (process.env.NODE_ENV === "production") {
    console.info("[Auth] Skipping development test accounts in production");
    return 0;
  }

  const adminPassword = process.env.LOCAL_TEST_ADMIN_PASSWORD;
  const employeePassword = process.env.LOCAL_TEST_EMPLOYEE_PASSWORD;
  const customerPassword = process.env.LOCAL_TEST_CUSTOMER_PASSWORD;
  if (!adminPassword || !employeePassword || !customerPassword) {
    const missingCredentials = [
      !adminPassword && "admin",
      !employeePassword && "employee",
      !customerPassword && "customer",
    ].filter((role): role is string => Boolean(role));
    console.info(
      `[Auth] Skipping development test accounts; set password variables for: ${missingCredentials.join(", ")}`
    );
    return 0;
  }

  const accounts = [
    {
      name: "Leaflore Admin",
      email: "admin@leaflore.com",
      password: adminPassword,
      role: "admin",
    },
    {
      name: "Leaflore Employee",
      email: "employee@leaflore.com",
      password: employeePassword,
      role: "employee",
    },
    {
      name: "Leaflore Customer",
      email: "customer@gmail.com",
      password: customerPassword,
      role: "user",
    },
  ] as const;
  let createdCount = 0;

  for (const account of accounts) {
    if (findUserByEmail(account.email)) continue;
    try {
      await createLocalUser(account);
      createdCount += 1;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "An account with that email already exists" &&
        findUserByEmail(account.email)
      ) {
        continue;
      }
      throw error;
    }
  }

  if (createdCount > 0) {
    console.info(`[Auth] Seeded ${createdCount} development test account(s)`);
  }
  return createdCount;
}

export async function bootstrapInitialAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!email || !password) {
    throw new Error(
      "Set both INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD to provision the first admin"
    );
  }
  if (password.length < 12)
    throw new Error("INITIAL_ADMIN_PASSWORD must be at least 12 characters");
  const existing = database
    .prepare("SELECT id FROM local_users WHERE role = 'admin' LIMIT 1")
    .get();
  if (!existing) {
    await createLocalUser({
      email,
      name: process.env.INITIAL_ADMIN_NAME?.trim() || "Store Admin",
      password,
      role: "admin",
    });
    console.info("[Auth] Initial admin account provisioned");
  }
}

export async function loginLocalUser(email: string, password: string) {
  const row = database
    .prepare("SELECT * FROM local_users WHERE email = ? COLLATE NOCASE")
    .get(email.trim()) as Record<string, unknown> | undefined;
  if (!row || !(await verifyPassword(password, String(row.password_hash))))
    return null;
  database
    .prepare(
      "UPDATE local_users SET last_signed_in = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(Number(row.id));
  return findUser(Number(row.id));
}

export function createLocalSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + 1000 * 60 * 60 * 24 * 30
  ).toISOString();
  database
    .prepare(
      "INSERT INTO local_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"
    )
    .run(hashToken(token), userId, expiresAt);
  return { token, maxAge: 1000 * 60 * 60 * 24 * 30 };
}

export function getLocalSessionUser(token: string) {
  const tokenHash = hashToken(token);
  const row = database
    .prepare(
      `
    SELECT u.* FROM local_sessions s
    JOIN local_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `
    )
    .get(tokenHash, new Date().toISOString());
  if (row) return toLocalUser(row as Record<string, unknown>);
  database
    .prepare("DELETE FROM local_sessions WHERE token_hash = ?")
    .run(tokenHash);
  return null;
}

export function deleteLocalSession(token: string) {
  database
    .prepare("DELETE FROM local_sessions WHERE token_hash = ?")
    .run(hashToken(token));
}

export async function createEmployee(input: {
  email: string;
  name: string;
  password: string;
}) {
  return createLocalUser({ ...input, role: "employee" });
}

export type EmployeeReport = {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeEmail: string;
  reportText: string;
  createdAt: string;
};

function toEmployeeReport(row: Record<string, unknown>): EmployeeReport {
  const createdAt = String(row.created_at).replace(" ", "T") + "Z";
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    employeeName: String(row.employee_name),
    employeeEmail: String(row.employee_email),
    reportText: String(row.report_text),
    createdAt,
  };
}

export function createEmployeeReport(employee: LocalUser, reportText: string) {
  if (employee.role !== "employee")
    throw new Error("Only employees can submit daily progress reports");
  const text = reportText.trim();
  if (!text) throw new Error("Report text is required");
  const result = database
    .prepare(
      `INSERT INTO employee_reports
        (employee_id, employee_name, employee_email, report_text)
       VALUES (?, ?, ?, ?)`
    )
    .run(employee.id, employee.name, employee.email, text);
  const row = database
    .prepare("SELECT * FROM employee_reports WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Could not save daily progress report");
  return toEmployeeReport(row);
}

export function listEmployeeReports(employee?: LocalUser) {
  const rows = employee
    ? database
        .prepare(
          "SELECT * FROM employee_reports WHERE employee_id = ? ORDER BY created_at DESC, id DESC"
        )
        .all(employee.id)
    : database
        .prepare(
          "SELECT * FROM employee_reports ORDER BY created_at DESC, id DESC"
        )
        .all();
  return (rows as Record<string, unknown>[]).map(toEmployeeReport);
}

type ConversationRow = Record<string, unknown>;

function listMessages(conversationId: number) {
  return database
    .prepare(
      `
    SELECT m.id, m.sender_role AS senderRole, m.body, m.created_at AS createdAt, u.name AS senderName
    FROM support_messages m
    LEFT JOIN local_users u ON u.id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.id
  `
    )
    .all(conversationId);
}

function formatConversation(row: ConversationRow) {
  const id = Number(row.id);
  return {
    id,
    userId: Number(row.user_id),
    customerName: String(row.customer_name),
    customerEmail: String(row.customer_email),
    channel: String(row.channel) as "system" | "books",
    subject: String(row.subject),
    status: String(row.status) as "open" | "resolved",
    updatedAt: String(row.updated_at),
    messages: listMessages(id),
  };
}

export function listConversations(user: LocalUser) {
  const where =
    user.role === "user"
      ? "WHERE c.user_id = ?"
      : user.role === "admin"
        ? "WHERE c.channel = 'system'"
        : "WHERE c.channel = 'books'";
  const rows = database
    .prepare(
      `
    SELECT c.*, u.name AS customer_name, u.email AS customer_email
    FROM support_conversations c JOIN local_users u ON u.id = c.user_id
    ${where}
    ORDER BY c.updated_at DESC, c.id DESC
  `
    )
    .all(...(user.role === "user" ? [user.id] : [])) as ConversationRow[];
  return rows.map(formatConversation);
}

const faqReplies: Array<{ keywords: string[]; answer: string }> = [
  {
    keywords: ["delivery", "shipping", "arrive", "days"],
    answer:
      "Standard Philippines delivery is estimated at 3–7 business days. Imported or special-order books can take longer than this standard estimate; ask an employee here to confirm if you are unsure about a title.",
  },
  {
    keywords: ["order", "track", "status"],
    answer:
      "You can check the latest order and payment status in your account's transaction history. If you still need help, an employee can follow up here.",
  },
  {
    keywords: ["payment", "gcash", "card", "pay"],
    answer:
      "Checkout uses PayMongo's hosted payment page when the store's test or live credentials are configured. Card, GCash, and QR Ph appear only when enabled for the merchant account.",
  },
  {
    keywords: ["refund", "return", "cancel"],
    answer:
      "Please share your order number and what happened. A support employee will review your request.",
  },
];

function automatedReply(message: string) {
  const normalized = message.toLowerCase();
  return (
    faqReplies.find(faq =>
      faq.keywords.some(keyword => normalized.includes(keyword))
    )?.answer ??
    "Thanks for reaching out. I've recorded your message and a team member can help you shortly."
  );
}

export function createConversation(
  user: LocalUser,
  channel: "system" | "books",
  subject: string,
  message: string
) {
  if (user.role !== "user")
    throw new Error("Only customer accounts can start a support conversation");
  const result = database
    .prepare(
      "INSERT INTO support_conversations (user_id, channel, subject) VALUES (?, ?, ?)"
    )
    .run(user.id, channel, subject.trim());
  const conversationId = Number(result.lastInsertRowid);
  const insertMessage = database.prepare(
    "INSERT INTO support_messages (conversation_id, sender_id, sender_role, body) VALUES (?, ?, ?, ?)"
  );
  insertMessage.run(conversationId, user.id, user.role, message.trim());
  insertMessage.run(conversationId, null, "bot", automatedReply(message));
  const row = database
    .prepare(
      `
    SELECT c.*, u.name AS customer_name, u.email AS customer_email
    FROM support_conversations c JOIN local_users u ON u.id = c.user_id WHERE c.id = ?
  `
    )
    .get(conversationId) as ConversationRow;
  return formatConversation(row);
}

export function replyToConversation(
  user: LocalUser,
  conversationId: number,
  message: string
) {
  const row = database
    .prepare("SELECT * FROM support_conversations WHERE id = ?")
    .get(conversationId) as ConversationRow | undefined;
  if (!row) throw new Error("Conversation not found");
  if (user.role === "user" && Number(row.user_id) !== user.id)
    throw new Error("Conversation not found");
  if (user.role === "admin" && row.channel !== "system")
    throw new Error("Conversation not found");
  if (user.role === "employee" && row.channel !== "books")
    throw new Error("Conversation not found");
  database
    .prepare(
      "INSERT INTO support_messages (conversation_id, sender_id, sender_role, body) VALUES (?, ?, ?, ?)"
    )
    .run(conversationId, user.id, user.role, message.trim());
  database
    .prepare(
      "UPDATE support_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(conversationId);
  const updated = database
    .prepare(
      `
    SELECT c.*, u.name AS customer_name, u.email AS customer_email
    FROM support_conversations c JOIN local_users u ON u.id = c.user_id WHERE c.id = ?
  `
    )
    .get(conversationId) as ConversationRow;
  return formatConversation(updated);
}

export function setConversationStatus(
  user: LocalUser,
  conversationId: number,
  status: "open" | "resolved"
) {
  const row = database
    .prepare("SELECT * FROM support_conversations WHERE id = ?")
    .get(conversationId) as ConversationRow | undefined;
  if (!row) throw new Error("Conversation not found");
  if (user.role === "user" && Number(row.user_id) !== user.id)
    throw new Error("Conversation not found");
  if (user.role === "admin" && row.channel !== "system")
    throw new Error("Conversation not found");
  if (user.role === "employee" && row.channel !== "books")
    throw new Error("Conversation not found");
  database
    .prepare(
      "UPDATE support_conversations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(status, conversationId);
}

export type LocalOrderItem = {
  bookId: string;
  title: string;
  priceCents: number;
  quantity: number;
};
export type LocalOrderInput = {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  city: string;
  postcode: string;
  items: LocalOrderItem[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  estimatedDelivery: string;
  paymentMethod: CheckoutPaymentMethod | "unknown";
};

export function saveLocalOrder(input: LocalOrderInput) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = database
      .prepare(
        `
      INSERT INTO local_orders (user_id, first_name, last_name, email, address, city, postcode, items_json,
        subtotal_cents, shipping_cents, total_cents, estimated_delivery, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        input.userId,
        input.firstName,
        input.lastName,
        input.email,
        input.address,
        input.city,
        input.postcode,
        JSON.stringify(input.items),
        input.subtotalCents,
        input.shippingCents,
        input.totalCents,
        input.estimatedDelivery,
        input.paymentMethod
      );
    const orderId = Number(result.lastInsertRowid);
    database
      .prepare(
        "INSERT INTO local_transactions (order_id, amount_cents, payment_method, status) VALUES (?, ?, ?, 'pending')"
      )
      .run(orderId, input.totalCents, input.paymentMethod);
    database.exec("COMMIT");
    return orderId;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function formatOrder(row: Record<string, unknown>) {
  const paymentMethod = row.transaction_payment_method ?? row.payment_method;
  return {
    id: Number(row.id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    email: String(row.email),
    address: String(row.address),
    city: String(row.city),
    postcode: String(row.postcode),
    items: JSON.parse(String(row.items_json)) as LocalOrderItem[],
    status: String(row.status),
    subtotalCents: Number(row.subtotal_cents),
    shippingCents: Number(row.shipping_cents),
    totalCents: Number(row.total_cents),
    estimatedDelivery: String(row.estimated_delivery),
    paymentMethod: paymentMethod ? String(paymentMethod) : null,
    paymentStatus: row.transaction_status
      ? String(row.transaction_status)
      : row.status === "paid"
        ? "completed"
        : "pending",
    transactionId: row.transaction_id ? Number(row.transaction_id) : null,
    transactionCreatedAt: row.transaction_created_at
      ? String(row.transaction_created_at)
      : String(row.created_at),
    checkoutUrl: row.checkout_url ? String(row.checkout_url) : null,
    createdAt: String(row.created_at),
  };
}

export function listOrders(user: LocalUser) {
  const rows = database
    .prepare(
      `
      SELECT o.*, t.id AS transaction_id, t.payment_method AS transaction_payment_method,
        t.status AS transaction_status, t.created_at AS transaction_created_at
      FROM local_orders o
      LEFT JOIN local_transactions t ON t.order_id = o.id
      ${user.role === "user" ? "WHERE o.user_id = ?" : ""}
      ORDER BY o.id DESC
    `
    )
    .all(...(user.role === "user" ? [user.id] : []));
  return (rows as Record<string, unknown>[]).map(formatOrder);
}

export function getBuyerAnalytics() {
  const row = database
    .prepare(
      `SELECT
        COUNT(DISTINCT CASE
          WHEN date(created_at) = date('now') THEN user_id
        END) AS daily,
        COUNT(DISTINCT CASE
          WHEN created_at >= datetime('now', 'start of month')
            AND created_at < datetime('now', 'start of month', '+1 month')
            THEN user_id
        END) AS monthly,
        COUNT(DISTINCT CASE
          WHEN created_at >= datetime('now', 'start of year')
            AND created_at < datetime('now', 'start of year', '+1 year')
            THEN user_id
        END) AS yearly
      FROM local_orders
      WHERE status IN ('paid', 'fulfilled')`
    )
    .get() as { daily: number; monthly: number; yearly: number };
  return {
    daily: Number(row.daily),
    monthly: Number(row.monthly),
    yearly: Number(row.yearly),
  };
}

export function listTransactions(user: LocalUser) {
  const rows = database
    .prepare(
      `
      SELECT t.id, t.order_id AS orderId, t.amount_cents AS amountCents,
        t.payment_method AS paymentMethod, t.status, t.created_at AS createdAt,
        o.status AS orderStatus, o.email, o.first_name AS firstName,
        o.last_name AS lastName, o.estimated_delivery AS estimatedDelivery
      FROM local_transactions t
      JOIN local_orders o ON o.id = t.order_id
      ${user.role === "user" ? "WHERE o.user_id = ?" : ""}
      ORDER BY t.id DESC
    `
    )
    .all(...(user.role === "user" ? [user.id] : []));
  return (rows as Record<string, unknown>[]).map(row => ({
    id: Number(row.id),
    orderId: Number(row.orderId),
    amountCents: Number(row.amountCents),
    paymentMethod: String(row.paymentMethod),
    status: String(row.status),
    orderStatus: String(row.orderStatus),
    email: String(row.email),
    customerName: `${String(row.firstName)} ${String(row.lastName)}`,
    estimatedDelivery: String(row.estimatedDelivery),
    createdAt: String(row.createdAt),
  }));
}

export function getOrderForUser(orderId: number, user: LocalUser) {
  const row =
    user.role === "user"
      ? database
          .prepare(
            `SELECT o.*, t.id AS transaction_id,
              t.payment_method AS transaction_payment_method,
              t.status AS transaction_status,
              t.created_at AS transaction_created_at
             FROM local_orders o LEFT JOIN local_transactions t ON t.order_id = o.id
             WHERE o.id = ? AND o.user_id = ?`
          )
          .get(orderId, user.id)
      : database
          .prepare(
            `SELECT o.*, t.id AS transaction_id,
              t.payment_method AS transaction_payment_method,
              t.status AS transaction_status,
              t.created_at AS transaction_created_at
             FROM local_orders o LEFT JOIN local_transactions t ON t.order_id = o.id
             WHERE o.id = ?`
          )
          .get(orderId);
  return row ? formatOrder(row as Record<string, unknown>) : null;
}

export function attachCheckoutSession(
  orderId: number,
  sessionId: string,
  checkoutUrl: string
) {
  database
    .prepare(
      "UPDATE local_orders SET payment_session_id = ?, checkout_url = ? WHERE id = ? AND status = 'pending'"
    )
    .run(sessionId, checkoutUrl, orderId);
}

export function cancelLocalOrder(orderId: number) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        "UPDATE local_orders SET status = 'cancelled', checkout_url = NULL WHERE id = ? AND status = 'pending'"
      )
      .run(orderId);
    database
      .prepare(
        "UPDATE local_transactions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND status = 'pending'"
      )
      .run(orderId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function markOrderPaid(
  orderId: number,
  sessionId: string,
  applyInventoryDeduction?: (items: LocalOrderItem[]) => Promise<void>
) {
  const candidate = database
    .prepare(
      "SELECT status, payment_session_id, items_json FROM local_orders WHERE id = ?"
    )
    .get(orderId) as
    | {
        status: string;
        payment_session_id: string | null;
        items_json: string;
      }
    | undefined;
  if (
    !candidate ||
    (candidate.status !== "pending" &&
      !(
        candidate.status === "paid" &&
        candidate.payment_session_id === sessionId
      )) ||
    candidate.payment_session_id !== sessionId
  ) {
    return false;
  }
  if (candidate.status === "paid") return true;
  const items = JSON.parse(candidate.items_json) as LocalOrderItem[];
  if (applyInventoryDeduction) await applyInventoryDeduction(items);

  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database
      .prepare(
        "SELECT status, payment_session_id FROM local_orders WHERE id = ?"
      )
      .get(orderId) as
      | { status: string; payment_session_id: string | null }
      | undefined;
    if (row?.status === "paid" && row.payment_session_id === sessionId) {
      database.exec("COMMIT");
      return true;
    }
    if (
      !row ||
      row.status !== "pending" ||
      row.payment_session_id !== sessionId
    ) {
      database.exec("ROLLBACK");
      return false;
    }
    if (!applyInventoryDeduction) deductLocalInventory(items);
    database
      .prepare(
        "UPDATE local_orders SET status = 'paid', checkout_url = NULL WHERE id = ?"
      )
      .run(orderId);
    database
      .prepare(
        "UPDATE local_transactions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND status = 'pending'"
      )
      .run(orderId);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function completeLocalSandboxPayment(
  orderId: number,
  applyInventoryDeduction?: (items: LocalOrderItem[]) => Promise<void>
) {
  const candidate = database
    .prepare(
      `SELECT o.status, o.payment_session_id, o.items_json,
        t.status AS transaction_status
       FROM local_orders o JOIN local_transactions t ON t.order_id = o.id
       WHERE o.id = ?`
    )
    .get(orderId) as
    | {
        status: string;
        payment_session_id: string | null;
        items_json: string;
        transaction_status: string;
      }
    | undefined;
  if (
    !candidate ||
    candidate.status !== "pending" ||
    candidate.payment_session_id !== null ||
    candidate.transaction_status !== "pending"
  ) {
    return false;
  }
  const items = JSON.parse(candidate.items_json) as LocalOrderItem[];
  if (applyInventoryDeduction) await applyInventoryDeduction(items);

  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database
      .prepare(
        `SELECT o.status, o.payment_session_id,
          t.status AS transaction_status
         FROM local_orders o JOIN local_transactions t ON t.order_id = o.id
         WHERE o.id = ?`
      )
      .get(orderId) as
      | {
          status: string;
          payment_session_id: string | null;
          transaction_status: string;
        }
      | undefined;
    if (
      !row ||
      row.status !== "pending" ||
      row.payment_session_id !== null ||
      row.transaction_status !== "pending"
    ) {
      database.exec("ROLLBACK");
      return false;
    }
    if (!applyInventoryDeduction) deductLocalInventory(items);
    database
      .prepare(
        "UPDATE local_orders SET status = 'paid' WHERE id = ? AND status = 'pending'"
      )
      .run(orderId);
    database
      .prepare(
        "UPDATE local_transactions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?"
      )
      .run(orderId);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function setOrderStatus(
  orderId: number,
  status: "paid" | "fulfilled" | "cancelled"
) {
  database
    .prepare("UPDATE local_orders SET status = ? WHERE id = ?")
    .run(status, orderId);
  if (status === "cancelled") {
    database
      .prepare(
        "UPDATE local_transactions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND status = 'pending'"
      )
      .run(orderId);
  } else if (status === "paid") {
    database
      .prepare(
        "UPDATE local_transactions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND status = 'pending'"
      )
      .run(orderId);
  }
}
