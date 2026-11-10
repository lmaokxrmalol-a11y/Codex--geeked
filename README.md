# codex-geeked — Online Bookshop

codex-geeked is a React / Express / tRPC / Drizzle online bookstore for curious readers. It includes a 16-book catalog priced in Philippine pesos, customer/admin/employee accounts, two separate support inboxes with FAQ replies, Philippines delivery estimates, order history, and PayMongo-hosted checkout.

## Run it

Use `pnpm dev` for the full development server on port 3000. Use `pnpm check` for TypeScript, `pnpm test` for the application tests, and `pnpm build` followed by `pnpm start` for the production server build. Node.js 24 or newer is required for the built-in SQLite account/order store. Without MySQL, the storefront catalog uses its bundled starter books and the guest cart is in server memory; accounts, conversations, and transactions are persisted to `.data/leaflore.sqlite`.

To provision the first admin, set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` (at least 12 characters) in the ignored `.env` file and start the server. Optionally set `INITIAL_ADMIN_NAME`. Admins create employee accounts from the Account panel; customers can register themselves. There is no public admin or employee registration.

To enable test payments, configure `PAYMONGO_SECRET_KEY` with a PayMongo test key, `PAYMONGO_WEBHOOK_SECRET` with the webhook signing secret, and `PUBLIC_APP_URL` with the app's base URL. Optional `PAYMONGO_PAYMENT_METHOD_TYPES` is a comma-separated list (default `card,gcash,qrph`); PayMongo only displays methods enabled for the merchant account. Configure a PayMongo webhook at `/webhooks/paymongo` for `checkout_session.payment.paid`. A local webhook needs a reachable HTTPS tunnel; the return redirect alone never marks an order paid. Live payments require explicitly setting `PAYMONGO_MODE=live` and using a live secret and webhook secret. Never put payment credentials in browser code or collect raw card details in this app.

Prices use PHP; orders over ₱1,500 receive free shipping, while other orders are charged ₱99 shipping. Checkout accepts four-digit Philippine postal codes and estimates delivery within 3–7 business days. MySQL remains optional for the book catalog and cart. Database commands are `pnpm db:push`, `pnpm db:migrate`, and `pnpm db:seed`.

## Architecture

| Area                 | Responsibility                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `client/src/App.tsx` | Storefront UI, search/category/price filters, sorting, cart/wishlist, and checkout |
| `client/src/components/AccountSupport.tsx` | Local login/registration, order history, staff account creation, and support inboxes |
| `shared/books.ts`    | Canonical seed catalog and shared book types                                               |
| `drizzle/schema.ts`  | MySQL catalog, guest cart/wishlist, and role definitions                                   |
| `server/localStore.ts` | SQLite accounts/sessions, support conversations, and transaction history                |
| `server/payments.ts` | PayMongo hosted checkout and webhook signature verification                                |
| `server/db.ts`       | Drizzle catalog/cart queries and server-side order totals                                  |
| `server/routers.ts`  | Typed tRPC API surface                                                                     |
| `server/seed.ts`     | Repeatable starter-catalog synchronization command                                         |

## API surface

- `catalog.list` and `catalog.get` serve database-backed books.
- `store.state` hydrates a guest session's wishlist IDs and cart quantities.
- `store.toggleWishlist`, `store.addToCart`, `store.setCartQuantity`, and `store.removeFromCart` persist storefront interactions.
- `auth.register` and `auth.login` create customer accounts and local sessions; the first admin is provisioned from server-only environment variables.
- `support.*` keeps system problem reports (admin inbox) separate from book/order inquiries (employee inbox) and sends a local FAQ response immediately.
- `commerce.orders` returns a customer's transaction history or the staff order list. `checkout.createOrder` creates a pending local order, starts PayMongo-hosted checkout, and clears the cart only after checkout creation succeeds. Only a verified paid webhook changes payment status.

Guest cart identity is a random browser session ID stored in localStorage. Local account sessions are opaque, HTTP-only cookies; only password hashes are stored. Set `LOCAL_DB_PATH` to move the SQLite file. Without `DATABASE_URL`, the cart remains in memory for the lifetime of the server; transaction history and support records survive restarts.
