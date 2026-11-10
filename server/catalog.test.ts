import { afterEach, describe, expect, it, vi } from "vitest";
import {
  books,
  FREE_SHIPPING_THRESHOLD,
  getShippingPrice,
  SHIPPING_PRICE,
} from "../shared/books";
import { formatPrice } from "../client/src/lib/currency";
import {
  addToCart,
  createOrder,
  getStoreState,
  listCatalog,
  toggleWishlist,
} from "./db";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("codex-geeked catalog", () => {
  it("contains sixteen uniquely identified books with PHP prices", () => {
    expect(books).toHaveLength(16);
    expect(new Set(books.map(book => book.id)).size).toBe(books.length);
    expect(
      books.every(book => Number.isInteger(book.price) && book.price > 0)
    ).toBe(true);
  });

  it("formats prices in Philippine pesos", () => {
    expect(formatPrice(1600)).toBe("₱1,600");
    expect(formatPrice(449)).toBe("₱449");
  });

  it("applies free shipping only above the advertised threshold", () => {
    expect(getShippingPrice(FREE_SHIPPING_THRESHOLD)).toBe(SHIPPING_PRICE);
    expect(getShippingPrice(FREE_SHIPPING_THRESHOLD + 1)).toBe(0);
  });

  it("supports browsing, cart, wishlist, and preview checkout without MySQL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const sessionId = "local-preview-session-001";
    expect(await listCatalog()).toHaveLength(16);
    await addToCart(sessionId, "project-hail-mary", 1);
    await toggleWishlist(sessionId, "project-hail-mary");
    expect(await getStoreState(sessionId)).toEqual({
      wishlistIds: ["project-hail-mary"],
      cart: [{ bookId: "project-hail-mary", quantity: 1 }],
    });

    const order = await createOrder({
      sessionId,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      address: "12 Mabini Street",
      city: "Manila",
      postcode: "1000",
    });
    expect(order).toMatchObject({
      subtotalCents: 79900,
      shippingCents: 9900,
      totalCents: 89800,
      localOnly: true,
    });
    expect((await getStoreState(sessionId)).cart).toEqual([]);
  });
});
