import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { books as seedBooks } from "../shared/books";
import { books as booksTable, cartItems, orderItems, orders, type BookRow, type InsertUser, users, wishlistItems } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      _db = drizzle(ENV.databaseUrl);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

function serializeBook(row: BookRow) {
  let tags: string[] = [];
  try { tags = JSON.parse(row.tags) as string[]; } catch { tags = row.tags.split(",").filter(Boolean); }
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    category: row.category,
    price: row.priceCents / 100,
    rating: row.ratingTenths / 10,
    reviews: row.reviews,
    summary: row.summary,
    description: row.description,
    pages: row.pages,
    format: row.format,
    published: String(row.published),
    coverColor: row.coverColor,
    coverAccent: row.coverAccent,
    coverLabel: row.coverLabel,
    tags,
    featured: row.featured === 1,
    badge: row.badge ?? undefined,
  };
}

export async function seedCatalogIfEmpty() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(booksTable);
  if (Number(countResult[0]?.count ?? 0) > 0) return false;
  await db.insert(booksTable).values(seedBooks.map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    category: book.category,
    priceCents: Math.round(book.price * 100),
    ratingTenths: Math.round(book.rating * 10),
    reviews: book.reviews,
    summary: book.summary,
    description: book.description,
    pages: book.pages,
    format: book.format,
    published: Number(book.published),
    coverColor: book.coverColor,
    coverAccent: book.coverAccent,
    coverLabel: book.coverLabel,
    tags: JSON.stringify(book.tags),
    featured: book.featured ? 1 : 0,
    badge: book.badge ?? null,
  })));
  return true;
}

export async function listCatalog() {
  await seedCatalogIfEmpty();
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(booksTable).orderBy(desc(booksTable.featured), asc(booksTable.title));
  return rows.map(serializeBook);
}

export async function getCatalogBook(id: string) {
  await seedCatalogIfEmpty();
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(booksTable).where(eq(booksTable.id, id)).limit(1);
  return rows[0] ? serializeBook(rows[0]) : null;
}

export async function getStoreState(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [wishlist, cart] = await Promise.all([
    db.select({ bookId: wishlistItems.bookId }).from(wishlistItems).where(eq(wishlistItems.sessionId, sessionId)),
    db.select({ bookId: cartItems.bookId, quantity: cartItems.quantity }).from(cartItems).where(eq(cartItems.sessionId, sessionId)),
  ]);
  return { wishlistIds: wishlist.map((item) => item.bookId), cart: cart.map((item) => ({ bookId: item.bookId, quantity: item.quantity })) };
}

export async function toggleWishlist(sessionId: string, bookId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ id: wishlistItems.id }).from(wishlistItems).where(and(eq(wishlistItems.sessionId, sessionId), eq(wishlistItems.bookId, bookId))).limit(1);
  if (existing[0]) {
    await db.delete(wishlistItems).where(eq(wishlistItems.id, existing[0].id));
    return { saved: false };
  }
  await db.insert(wishlistItems).values({ sessionId, bookId });
  return { saved: true };
}

export async function addToCart(sessionId: string, bookId: string, quantity: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ id: cartItems.id, quantity: cartItems.quantity }).from(cartItems).where(and(eq(cartItems.sessionId, sessionId), eq(cartItems.bookId, bookId))).limit(1);
  if (existing[0]) await db.update(cartItems).set({ quantity: existing[0].quantity + quantity }).where(eq(cartItems.id, existing[0].id));
  else await db.insert(cartItems).values({ sessionId, bookId, quantity });
  return getStoreState(sessionId);
}

export async function setCartQuantity(sessionId: string, bookId: string, quantity: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (quantity <= 0) return removeFromCart(sessionId, bookId);
  await db.update(cartItems).set({ quantity }).where(and(eq(cartItems.sessionId, sessionId), eq(cartItems.bookId, bookId)));
  return getStoreState(sessionId);
}

export async function removeFromCart(sessionId: string, bookId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(cartItems).where(and(eq(cartItems.sessionId, sessionId), eq(cartItems.bookId, bookId)));
  return getStoreState(sessionId);
}

export async function createOrder(input: { sessionId: string; firstName: string; lastName: string; email: string; address: string; city: string; postcode: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const lines = await db.select({ cart: cartItems, book: booksTable }).from(cartItems).innerJoin(booksTable, eq(cartItems.bookId, booksTable.id)).where(eq(cartItems.sessionId, input.sessionId));
  if (lines.length === 0) throw new Error("Your reading stack is empty");
  const subtotalCents = lines.reduce((sum, line) => sum + line.book.priceCents * line.cart.quantity, 0);
  const shippingCents = subtotalCents > 3500 ? 0 : 495;
  const totalCents = subtotalCents + shippingCents;
  const result = await db.insert(orders).values({ ...input, status: "pending", subtotalCents, shippingCents, totalCents });
  const orderId = Number(result[0]?.insertId);
  if (!orderId) throw new Error("Could not create order");
  await db.insert(orderItems).values(lines.map((line) => ({ orderId, bookId: line.book.id, title: line.book.title, priceCents: line.book.priceCents, quantity: line.cart.quantity })));
  await db.delete(cartItems).where(eq(cartItems.sessionId, input.sessionId));
  return { orderId, subtotalCents, shippingCents, totalCents };
}
