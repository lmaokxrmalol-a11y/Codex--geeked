# codex-geeked — Online Bookshop

codex-geeked is a React / Express / tRPC / Drizzle online bookstore for curious readers. It includes a 16-book catalog priced in Philippine pesos, customer/admin/employee accounts, separate support inboxes, employee daily progress reports, admin buyer analytics, Philippines delivery estimates, order history, and PayMongo-hosted checkout.

## Run it

Use `pnpm dev` for the full development server on port 3000. Use `pnpm check` for TypeScript, `pnpm test` for the application tests, and `pnpm build` followed by `pnpm start` for the production server build. Node.js 24 or newer is required for the built-in SQLite account/order store. Without MySQL, the storefront catalog uses its bundled starter books and the guest cart is in server memory; accounts, conversations, and transactions are persisted to `.data/leaflore.sqlite`.

Development startup seeds these local SQLite test accounts when their emails do not already exist and their passwords are configured in the ignored `.env` file: `admin@leaflore.com`, `employee@leaflore.com`, and `customer@gmail.com`. Set `LOCAL_TEST_ADMIN_PASSWORD`, `LOCAL_TEST_EMPLOYEE_PASSWORD`, and `LOCAL_TEST_CUSTOMER_PASSWORD` in `.env`; `.env.example` lists the variable names. The customer account uses the internal `user` role. Automatic test-account seeding is skipped when `NODE_ENV=production`, and existing accounts are never overwritten. Use test-only passwords, not production credentials.

To provision a custom first admin, set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` (at least 12 characters) in the ignored `.env` file and start the server. Optionally set `INITIAL_ADMIN_NAME`. Admins create employee accounts from the Account panel; customers can register themselves. There is no public admin or employee registration. Run `pnpm db:seed` to seed missing local test accounts and synchronize the starter catalog.

Checkout offers GCash, credit/debit card, and QR Ph. With PayMongo configured (`PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, and `PUBLIC_APP_URL`), checkout opens a PayMongo hosted session containing only the selected enabled payment method. Optional `PAYMONGO_PAYMENT_METHOD_TYPES` is a comma-separated list (default `card,gcash,qrph`); methods must also be enabled for the merchant account. In local development, when PayMongo is not configured, online selections simulate completion locally; the Direct Sandbox Test option is development-only. Production checkout requires PayMongo and never marks a mock payment as completed. Configure a PayMongo webhook at `/webhooks/paymongo` for `checkout_session.payment.paid`. A local webhook needs a reachable HTTPS tunnel; the return redirect alone never marks an order paid. Orders and matching `local_transactions` records are persisted to SQLite, and the cart clears only after local payment completion or successful PayMongo session creation. Live payments require explicitly setting `PAYMONGO_MODE=live` and using a live secret and webhook secret. Never put payment credentials in browser code or collect raw card details in this app.

Prices use PHP; orders over ₱1,500 receive free shipping, while other orders are charged ₱99 shipping. Checkout accepts four-digit Philippine postal codes and estimates delivery within 3–7 business days. MySQL remains optional for the book catalog and cart. Inventory starts at 10 copies per starter title, persists in MySQL when `DATABASE_URL` is configured, and otherwise persists in SQLite. Employees and admins use dedicated full-page workspaces at `/employee` and `/admin`; staff sessions are redirected to their workspace rather than the customer storefront. Only customers and unauthenticated visitors see purchasing controls; the server also rejects staff cart changes and checkout submissions. Employees can submit daily progress reports, and admins can review the report feed and distinct paid-buyer counts for the day, month, and year. These counts begin at zero when there are no completed orders; no sample orders or reports are seeded. A paid checkout decrements stock once, and checkout/cart operations reject quantities above available stock. After schema changes, run `pnpm db:push` to generate and apply migrations. Database commands are `pnpm db:push`, `pnpm db:migrate`, and `pnpm db:seed`.

## Architecture

| Area                                       | Responsibility                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `client/src/App.tsx`                       | Storefront UI, search/category/price filters, sorting, cart/wishlist, and checkout                                          |
| `client/src/components/AccountSupport.tsx` | Local login/registration, order history, staff inventory/restocking, employee reports, admin analytics, and support inboxes |
| `shared/books.ts`                          | Canonical seed catalog and shared book types                                                                                |
| `shared/schema.ts`                         | Shared MySQL catalog/inventory, guest cart/wishlist, employee reports, and roles                                            |
| `server/drizzle/`                          | Backend-owned MySQL migrations and snapshots                                                                                |
| `server/localStore.ts`                     | SQLite accounts/sessions, inventory, reports, buyer analytics, and transactions                                             |
| `server/payments.ts`                       | PayMongo hosted checkout and webhook signature verification                                                                 |
| `server/db.ts`                             | Drizzle catalog/inventory/cart queries and server-side order totals                                                         |
| `server/routers.ts`                        | Typed tRPC API surface                                                                                                      |
| `server/seed.ts`                           | Development account and starter-catalog seeding command                                                                     |

## API surface

- `catalog.list` and `catalog.get` serve books with current stock; staff use `catalog.inventory` and `catalog.restockBook`.
- `store.state` hydrates a guest session's wishlist IDs and cart quantities.
- `store.toggleWishlist`, `store.addToCart`, `store.setCartQuantity`, and `store.removeFromCart` persist storefront interactions.
- Unauthenticated visitors and customers can use shopping mutations; `checkout.createOrder` requires a customer account, and staff accounts are denied cart mutations and checkout.
- `auth.register` and `auth.login` create customer accounts and local sessions; the first admin is provisioned from server-only environment variables.
- `reports.mine` and `reports.submit` are employee-only; admins use `reports.all` and `admin.buyerAnalytics`.
- `support.*` keeps system problem reports (admin inbox) separate from book/order inquiries (employee inbox) and sends a local FAQ response immediately.
- `commerce.orders` returns a customer's transaction history or the staff order list. `checkout.createOrder` creates a pending local order, starts PayMongo-hosted checkout, and clears the cart only after checkout creation succeeds. Only a verified paid webhook changes payment status.

Guest cart identity is a random browser session ID stored in localStorage. Local account sessions are opaque, HTTP-only cookies; only password hashes are stored. Set `LOCAL_DB_PATH` to move the SQLite file. Without `DATABASE_URL`, the cart remains in memory for the lifetime of the server; transaction history and support records survive restarts.
