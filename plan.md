
## Full-stack extension
- Enable managed `server:true` and `database:true` capabilities; deploy through the existing Dockerfile and `/api/health`.
- Move the canonical catalog into `shared/books.ts`, seed it once into the managed `books` table, and serialize stored cents/tenths values back to the original UI shape.
- Persist guest sessions using a browser-generated `leaf-lore-session-id` stored in localStorage. The database stores wishlist rows, cart rows, pending orders, and immutable order item snapshots without requiring payment or a login flow.
- Expose typed tRPC procedures for `catalog.list`, `catalog.get`, `store.state`, wishlist/cart mutations, and `checkout.createOrder`.
- Keep the existing React experience and visual system; hydrate it from the API, optimistically update cart/wishlist state, validate delivery fields in the checkout form, and save a pending order when the preview is submitted.
