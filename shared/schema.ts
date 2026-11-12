import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "employee", "admin"])
    .default("user")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const books = mysqlTable("books", {
  id: varchar("id", { length: 64 }).primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  author: varchar("author", { length: 255 }).notNull(),
  category: mysqlEnum("category", [
    "Fiction",
    "Nonfiction",
    "Poetry",
    "Food & drink",
  ]).notNull(),
  priceCents: int("priceCents").notNull(),
  ratingTenths: int("ratingTenths").notNull(),
  reviews: int("reviews").notNull().default(0),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  pages: int("pages").notNull(),
  format: varchar("format", { length: 64 }).notNull(),
  published: int("published").notNull(),
  coverColor: varchar("coverColor", { length: 16 }).notNull(),
  coverAccent: varchar("coverAccent", { length: 16 }).notNull(),
  coverLabel: varchar("coverLabel", { length: 64 }).notNull(),
  coverImage: varchar("coverImage", { length: 1024 }),
  stock: int("stock").notNull().default(10),
  tags: text("tags").notNull(),
  featured: int("featured").notNull().default(0),
  badge: varchar("badge", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inventoryDeductions = mysqlTable("inventoryDeductions", {
  orderKey: varchar("orderKey", { length: 128 }).primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const wishlistItems = mysqlTable(
  "wishlistItems",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: varchar("sessionId", { length: 128 }).notNull(),
    bookId: varchar("bookId", { length: 64 })
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    sessionBookUnique: uniqueIndex("wishlist_session_book_unique").on(
      table.sessionId,
      table.bookId
    ),
  })
);

export const cartItems = mysqlTable(
  "cartItems",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: varchar("sessionId", { length: 128 }).notNull(),
    bookId: varchar("bookId", { length: 64 })
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    quantity: int("quantity").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    sessionBookUnique: uniqueIndex("cart_session_book_unique").on(
      table.sessionId,
      table.bookId
    ),
  })
);

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 128 }).notNull(),
  firstName: varchar("firstName", { length: 120 }).notNull(),
  lastName: varchar("lastName", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  address: varchar("address", { length: 255 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  postcode: varchar("postcode", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["pending", "paid", "fulfilled", "cancelled"])
    .default("pending")
    .notNull(),
  subtotalCents: int("subtotalCents").notNull(),
  shippingCents: int("shippingCents").notNull(),
  totalCents: int("totalCents").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const orderItems = mysqlTable("orderItems", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  bookId: varchar("bookId", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  priceCents: int("priceCents").notNull(),
  quantity: int("quantity").notNull(),
});

export const employeeReports = mysqlTable("employeeReports", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  employeeName: text("employeeName").notNull(),
  employeeEmail: varchar("employeeEmail", { length: 320 }).notNull(),
  reportText: text("reportText").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type BookRow = typeof books.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
