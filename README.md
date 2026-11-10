# Leaf & Lore — Full-stack Online Bookshop

Leaf & Lore is a working React / Express / tRPC / Drizzle bookshop. The interface keeps its editorial storefront feel while the managed MySQL database now owns the catalog, guest cart, wishlist, and pending checkout orders.

## Run it

Use `pnpm dev` for the full development server on port 3000. Use `pnpm check` for TypeScript, `pnpm test` for the existing application tests, and `pnpm build` followed by `pnpm start` for the production server build. The project is configured with managed `server:true` and `database:true` resources; the runtime receives `DATABASE_URL` from the platform.

Database commands are `pnpm db:push` to generate and apply an additive Drizzle migration, `pnpm db:migrate` to apply committed migrations, and `pnpm db:seed` to seed the canonical eight-book catalog only when the `books` table is empty.

## Architecture

| Area | Responsibility |
| --- | --- |
| `client/src/App.tsx` | Storefront UI, search/filter/sort, API hydration, optimistic cart/wishlist state, checkout form |
| `shared/books.ts` | Canonical seed catalog and shared book types |
| `drizzle/schema.ts` | Users, books, wishlist, cart, orders, and immutable order item snapshots |
| `server/db.ts` | Drizzle queries, catalog seeding, guest-session persistence, order creation |
| `server/routers.ts` | Typed tRPC API surface |
| `server/seed.ts` | Repeatable catalog seed command |

## API surface

- `catalog.list` and `catalog.get` serve database-backed books.
- `store.state` hydrates a guest session's wishlist IDs and cart quantities.
- `store.toggleWishlist`, `store.addToCart`, `store.setCartQuantity`, and `store.removeFromCart` persist storefront interactions.
- `checkout.createOrder` validates delivery fields, calculates shipping from server-side prices, creates a `pending` order with item snapshots, and clears the guest cart. No live payment is taken.

Guest identity is a random browser session ID stored in localStorage. This keeps the prototype usable without forcing a login while still making the cart and wishlist durable across refreshes on the same browser. Authentication routes from the Manus starter remain available for a future account experience.
