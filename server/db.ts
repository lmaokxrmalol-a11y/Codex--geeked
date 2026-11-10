import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { books as seedBooks, getShippingPrice } from "../shared/books";
import {
  books as booksTable,
  cartItems,
  orderItems,
  orders,
  type BookRow,
  type InsertUser,
  users,
  wishlistItems,
} from "../shared/schema";
import { ENV } from "./_core/env";
import { saveLocalOrder, type LocalOrderItem } from "./localStore";

let _db: ReturnType<typeof drizzle> | null = null;
let catalogSyncPromise: Promise<void> | undefined;
const localWishlists = new Map<string, Set<string>>();
const localCarts = new Map<string, Map<string, number>>();
let nextLocalOrderId = 1;

function getLocalWishlist(sessionId: string) {
  let wishlist = localWishlists.get(sessionId);
  if (!wishlist) {
    wishlist = new Set();
    localWishlists.set(sessionId, wishlist);
  }
  return wishlist;
}

function getLocalCart(sessionId: string) {
  let cart = localCarts.get(sessionId);
  if (!cart) {
    cart = new Map();
    localCarts.set(sessionId, cart);
  }
  return cart;
}

function assertSeedBookExists(bookId: string) {
  if (!seedBooks.some(book => book.id === bookId)) {
    throw new Error("Book is not in the local catalog");
  }
}

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
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

function serializeBook(row: BookRow) {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    tags = row.tags.split(",").filter(Boolean);
  }
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

async function syncCatalog() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values = seedBooks.map(book => ({
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
  }));
  await db
    .insert(booksTable)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        title: sql`values(${booksTable.title})`,
        author: sql`values(${booksTable.author})`,
        category: sql`values(${booksTable.category})`,
        priceCents: sql`values(${booksTable.priceCents})`,
        ratingTenths: sql`values(${booksTable.ratingTenths})`,
        reviews: sql`values(${booksTable.reviews})`,
        summary: sql`values(${booksTable.summary})`,
        description: sql`values(${booksTable.description})`,
        pages: sql`values(${booksTable.pages})`,
        format: sql`values(${booksTable.format})`,
        published: sql`values(${booksTable.published})`,
        coverColor: sql`values(${booksTable.coverColor})`,
        coverAccent: sql`values(${booksTable.coverAccent})`,
        coverLabel: sql`values(${booksTable.coverLabel})`,
        tags: sql`values(${booksTable.tags})`,
        featured: sql`values(${booksTable.featured})`,
        badge: sql`values(${booksTable.badge})`,
      },
    });
}

export function ensureCatalogIsCurrent() {
  if (!catalogSyncPromise) {
    catalogSyncPromise = syncCatalog().catch((error: unknown) => {
      catalogSyncPromise = undefined;
      throw error;
    });
  }
  return catalogSyncPromise;
}

export async function listCatalog() {
  const db = await getDb();
  if (!db) return seedBooks;
  await ensureCatalogIsCurrent();
  const rows = await db
    .select()
    .from(booksTable)
    .orderBy(desc(booksTable.featured), asc(booksTable.title));
  return rows.map(serializeBook);
}

export async function getCatalogBook(id: string) {
  const db = await getDb();
  if (!db) return seedBooks.find(book => book.id === id) ?? null;
  await ensureCatalogIsCurrent();
  const rows = await db
    .select()
    .from(booksTable)
    .where(eq(booksTable.id, id))
    .limit(1);
  return rows[0] ? serializeBook(rows[0]) : null;
}

export async function getStoreState(sessionId: string) {
  const db = await getDb();
  if (!db) {
    return {
      wishlistIds: [...getLocalWishlist(sessionId)],
      cart: [...getLocalCart(sessionId)].map(([bookId, quantity]) => ({
        bookId,
        quantity,
      })),
    };
  }
  const [wishlist, cart] = await Promise.all([
    db
      .select({ bookId: wishlistItems.bookId })
      .from(wishlistItems)
      .where(eq(wishlistItems.sessionId, sessionId)),
    db
      .select({ bookId: cartItems.bookId, quantity: cartItems.quantity })
      .from(cartItems)
      .where(eq(cartItems.sessionId, sessionId)),
  ]);
  return {
    wishlistIds: wishlist.map(item => item.bookId),
    cart: cart.map(item => ({ bookId: item.bookId, quantity: item.quantity })),
  };
}

export async function toggleWishlist(sessionId: string, bookId: string) {
  const db = await getDb();
  if (!db) {
    assertSeedBookExists(bookId);
    const wishlist = getLocalWishlist(sessionId);
    if (wishlist.has(bookId)) {
      wishlist.delete(bookId);
      return { saved: false };
    }
    wishlist.add(bookId);
    return { saved: true };
  }
  const existing = await db
    .select({ id: wishlistItems.id })
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.sessionId, sessionId),
        eq(wishlistItems.bookId, bookId)
      )
    )
    .limit(1);
  if (existing[0]) {
    await db.delete(wishlistItems).where(eq(wishlistItems.id, existing[0].id));
    return { saved: false };
  }
  await db.insert(wishlistItems).values({ sessionId, bookId });
  return { saved: true };
}

export async function addToCart(
  sessionId: string,
  bookId: string,
  quantity: number
) {
  const db = await getDb();
  if (!db) {
    assertSeedBookExists(bookId);
    const cart = getLocalCart(sessionId);
    cart.set(bookId, (cart.get(bookId) ?? 0) + quantity);
    return getStoreState(sessionId);
  }
  const existing = await db
    .select({ id: cartItems.id, quantity: cartItems.quantity })
    .from(cartItems)
    .where(
      and(eq(cartItems.sessionId, sessionId), eq(cartItems.bookId, bookId))
    )
    .limit(1);
  if (existing[0])
    await db
      .update(cartItems)
      .set({ quantity: existing[0].quantity + quantity })
      .where(eq(cartItems.id, existing[0].id));
  else await db.insert(cartItems).values({ sessionId, bookId, quantity });
  return getStoreState(sessionId);
}

export async function setCartQuantity(
  sessionId: string,
  bookId: string,
  quantity: number
) {
  const db = await getDb();
  if (!db) {
    assertSeedBookExists(bookId);
    if (quantity <= 0) return removeFromCart(sessionId, bookId);
    getLocalCart(sessionId).set(bookId, quantity);
    return getStoreState(sessionId);
  }
  if (quantity <= 0) return removeFromCart(sessionId, bookId);
  await db
    .update(cartItems)
    .set({ quantity })
    .where(
      and(eq(cartItems.sessionId, sessionId), eq(cartItems.bookId, bookId))
    );
  return getStoreState(sessionId);
}

export async function removeFromCart(sessionId: string, bookId: string) {
  const db = await getDb();
  if (!db) {
    getLocalCart(sessionId).delete(bookId);
    return getStoreState(sessionId);
  }
  await db
    .delete(cartItems)
    .where(
      and(eq(cartItems.sessionId, sessionId), eq(cartItems.bookId, bookId))
    );
  return getStoreState(sessionId);
}

export async function createOrder(input: {
  sessionId: string;
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  city: string;
  postcode: string;
  paymentMethod: import("../shared/payments").CheckoutPaymentMethod;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) {
    const localCart = getLocalCart(input.sessionId);
    const localLines = [...localCart].flatMap(([bookId, quantity]) => {
      const book = seedBooks.find(item => item.id === bookId);
      return book ? [{ book, quantity }] : [];
    });
    if (localLines.length === 0) throw new Error("Your cart is empty");
    const subtotalCents = localLines.reduce(
      (sum, line) => sum + Math.round(line.book.price * 100) * line.quantity,
      0
    );
    const shippingCents = getShippingPrice(subtotalCents / 100) * 100;
    const totalCents = subtotalCents + shippingCents;
    const items: LocalOrderItem[] = localLines.map(line => ({
      bookId: line.book.id,
      title: line.book.title,
      priceCents: Math.round(line.book.price * 100),
      quantity: line.quantity,
    }));
    if (input.userId) {
      const orderId = saveLocalOrder({
        userId: input.userId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        address: input.address,
        city: input.city,
        postcode: input.postcode,
        items,
        subtotalCents,
        shippingCents,
        totalCents,
        estimatedDelivery: estimateDeliveryDate(),
        paymentMethod: input.paymentMethod,
      });
      return {
        orderId,
        subtotalCents,
        shippingCents,
        totalCents,
        items,
        paymentMethod: input.paymentMethod,
        localOnly: true,
      };
    }
    localCarts.delete(input.sessionId);
    return {
      orderId: nextLocalOrderId++,
      subtotalCents,
      shippingCents,
      totalCents,
      paymentMethod: input.paymentMethod,
      localOnly: true,
    };
  }
  const lines = await db
    .select({ cart: cartItems, book: booksTable })
    .from(cartItems)
    .innerJoin(booksTable, eq(cartItems.bookId, booksTable.id))
    .where(eq(cartItems.sessionId, input.sessionId));
  if (lines.length === 0) throw new Error("Your cart is empty");
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.book.priceCents * line.cart.quantity,
    0
  );
  const shippingCents = getShippingPrice(subtotalCents / 100) * 100;
  const totalCents = subtotalCents + shippingCents;
  const items: LocalOrderItem[] = lines.map(line => ({
    bookId: line.book.id,
    title: line.book.title,
    priceCents: line.book.priceCents,
    quantity: line.cart.quantity,
  }));
  if (input.userId) {
    const orderId = saveLocalOrder({
      userId: input.userId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      address: input.address,
      city: input.city,
      postcode: input.postcode,
      items,
      subtotalCents,
      shippingCents,
      totalCents,
      estimatedDelivery: estimateDeliveryDate(),
      paymentMethod: input.paymentMethod,
    });
    return {
      orderId,
      subtotalCents,
      shippingCents,
      totalCents,
      items,
      paymentMethod: input.paymentMethod,
      localOnly: false,
    };
  }
  const result = await db.insert(orders).values({
    ...input,
    status: "pending",
    subtotalCents,
    shippingCents,
    totalCents,
  });
  const orderId = Number(result[0]?.insertId);
  if (!orderId) throw new Error("Could not create order");
  await db.insert(orderItems).values(
    lines.map(line => ({
      orderId,
      bookId: line.book.id,
      title: line.book.title,
      priceCents: line.book.priceCents,
      quantity: line.cart.quantity,
    }))
  );
  if (!input.userId) {
    await db.delete(cartItems).where(eq(cartItems.sessionId, input.sessionId));
  }
  return {
    orderId,
    subtotalCents,
    shippingCents,
    totalCents,
    paymentMethod: input.paymentMethod,
    localOnly: false,
  };
}

export async function clearCart(sessionId: string) {
  const db = await getDb();
  if (!db) {
    localCarts.delete(sessionId);
    return;
  }
  await db.delete(cartItems).where(eq(cartItems.sessionId, sessionId));
}

function estimateDeliveryDate() {
  const date = new Date();
  let weekdays = 0;
  while (weekdays < 7) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) weekdays++;
  }
  return date.toISOString().slice(0, 10);
}
