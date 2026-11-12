import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CreditCard,
  Gift,
  Heart,
  Leaf,
  Menu,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import BookCard from "./components/BookCard";
import BookCover from "./components/BookCover";
import AccountSupport from "./components/AccountSupport";
import {
  books,
  categories,
  FREE_SHIPPING_THRESHOLD,
  getShippingPrice,
  type Book,
  type BookCategory,
} from "./data/books";
import { trpc } from "./lib/trpc";
import { formatPrice } from "./lib/currency";
import {
  CHECKOUT_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type CheckoutPaymentMethod,
} from "../../shared/payments";

type SortOption = "featured" | "rating" | "newest" | "price-low" | "price-high";
type PriceFilter = "all" | "under-700" | "700-1200" | "over-1200";

function getBookshopSessionId() {
  const storageKey = "leaf-lore-session-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const sessionId = `${crypto.randomUUID()}-${Date.now()}`;
  window.localStorage.setItem(storageKey, sessionId);
  return sessionId;
}

function OrderConfirmation({ orderId }: { orderId: number }) {
  const orderQuery = trpc.commerce.order.useQuery(
    { id: orderId },
    {
      retry: false,
      refetchInterval: query =>
        query.state.data?.paymentStatus === "pending" ? 3000 : false,
    }
  );
  const order = orderQuery.data;
  const simulated =
    new URLSearchParams(window.location.search).get("simulated") === "true";

  return (
    <main className="order-confirmation page-width">
      <div className="order-confirmation__card">
        <span className="order-confirmation__icon">
          <CheckCircle2 size={28} />
        </span>
        <p className="eyebrow">
          <span className="eyebrow__line" /> Leaflore order
        </p>
        <h1>
          {orderQuery.isPending
            ? "Loading your order…"
            : orderQuery.isError
              ? "We couldn’t load this order."
              : order?.status === "paid"
                ? "Your order is confirmed."
                : "Payment confirmation is pending."}
        </h1>
        {orderQuery.isError ? (
          <p className="order-confirmation__message">
            Sign in with the customer account that placed this order, then check
            My Orders.
          </p>
        ) : order ? (
          <>
            <p className="order-confirmation__message">
              Order #{order.id} ·{" "}
              {order.paymentStatus === "completed"
                ? simulated
                  ? "Local sandbox payment completed"
                  : "Payment completed"
                : "Waiting for PayMongo to verify payment"}
            </p>
            <div className="order-confirmation__details">
              <div>
                <span>Payment method</span>
                <strong>
                  {PAYMENT_METHOD_LABELS[
                    order.paymentMethod as CheckoutPaymentMethod
                  ] ?? order.paymentMethod}
                </strong>
              </div>
              <div>
                <span>Payment status</span>
                <strong>{order.paymentStatus}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatPrice(order.totalCents / 100)}</strong>
              </div>
              <div>
                <span>Estimated delivery</span>
                <strong>{order.estimatedDelivery}</strong>
              </div>
            </div>
            <ul className="order-confirmation__items">
              {order.items.map(item => (
                <li key={item.bookId}>
                  <span>
                    {item.quantity} × {item.title}
                  </span>
                  <strong>
                    {formatPrice((item.priceCents * item.quantity) / 100)}
                  </strong>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="order-confirmation__actions">
          <button
            className="button button--primary"
            onClick={() => window.location.assign("/")}
          >
            Continue browsing <ArrowRight size={16} />
          </button>
          <button
            className="text-button"
            onClick={() => window.location.assign("/account/orders")}
          >
            View My Orders
          </button>
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const sessionId = useMemo(() => getBookshopSessionId(), []);
  const [activeCategory, setActiveCategory] = useState<BookCategory>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("featured");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpenRequest, setAccountOpenRequest] = useState(() => {
    const path = window.location.pathname;
    return ["/admin", "/employee", "/account/orders"].includes(path) ||
      new URLSearchParams(window.location.search).has("account")
      ? 1
      : 0;
  });
  const [notice, setNotice] = useState("");
  const [showAllFeatured, setShowAllFeatured] = useState(false);
  const [storeHydrated, setStoreHydrated] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<CheckoutPaymentMethod>("gcash");

  const currentUser = trpc.auth.me.useQuery();
  const catalogQuery = trpc.catalog.list.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const storeStateQuery = trpc.store.state.useQuery({ sessionId });
  const wishlistMutation = trpc.store.toggleWishlist.useMutation();
  const addToCartMutation = trpc.store.addToCart.useMutation();
  const setCartQuantityMutation = trpc.store.setCartQuantity.useMutation();
  const removeFromCartMutation = trpc.store.removeFromCart.useMutation();
  const createOrderMutation = trpc.checkout.createOrder.useMutation();
  const utils = trpc.useUtils();
  const canPurchase =
    currentUser.data?.role !== "employee" &&
    currentUser.data?.role !== "admin";

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (canPurchase) return;
    setCartOpen(false);
    setCheckoutOpen(false);
  }, [canPurchase]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const paymentState = url.searchParams.get("payment");
    const orderId = url.searchParams.get("order");
    if (!paymentState) return;
    setNotice(
      paymentState === "return"
        ? `Payment for order #${orderId ?? ""} is awaiting provider confirmation`
        : "Payment was not completed; your order remains unpaid"
    );
    url.searchParams.delete("payment");
    url.searchParams.delete("order");
    window.history.replaceState({}, "", url);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>(".header-search input")
          ?.focus();
      }
      if (event.key === "Escape") {
        setSelectedBook(null);
        setCartOpen(false);
        setCheckoutOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const catalogBooks = catalogQuery.data ?? books;
  const featuredBooks = useMemo(
    () =>
      catalogBooks
        .filter(book => book.featured)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [catalogBooks]
  );

  useEffect(() => {
    if (!storeStateQuery.data || storeHydrated) return;
    setWishlist(new Set(storeStateQuery.data.wishlistIds));
    setCart(
      Object.fromEntries(
        storeStateQuery.data.cart.map(item => [item.bookId, item.quantity])
      )
    );
    setStoreHydrated(true);
  }, [storeHydrated, storeStateQuery.data]);

  const applyStoreState = (state: {
    wishlistIds: string[];
    cart: Array<{ bookId: string; quantity: number }>;
  }) => {
    setWishlist(new Set(state.wishlistIds));
    setCart(
      Object.fromEntries(state.cart.map(item => [item.bookId, item.quantity]))
    );
    setStoreHydrated(true);
  };

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = catalogBooks.filter(book => {
      const matchesCategory =
        activeCategory === "All" || book.category === activeCategory;
      const matchesQuery =
        !query ||
        [book.title, book.author, book.summary, book.category, ...book.tags]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesPrice =
        priceFilter === "all" ||
        (priceFilter === "under-700" && book.price < 700) ||
        (priceFilter === "700-1200" &&
          book.price >= 700 &&
          book.price <= 1200) ||
        (priceFilter === "over-1200" && book.price > 1200);
      return matchesCategory && matchesQuery && matchesPrice;
    });

    return [...result].sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "newest") return Number(b.published) - Number(a.published);
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    });
  }, [activeCategory, catalogBooks, priceFilter, search, sort]);

  const cartItems = useMemo(
    () => catalogBooks.filter(book => cart[book.id]),
    [cart, catalogBooks]
  );
  const cartCount = Object.values(cart).reduce(
    (sum, quantity) => sum + quantity,
    0
  );
  const cartSubtotal = cartItems.reduce(
    (sum, book) => sum + book.price * cart[book.id],
    0
  );
  const cartShipping = getShippingPrice(cartSubtotal);
  const cartTotal = cartSubtotal + cartShipping;
  const selectedBookStock = selectedBook
    ? (catalogBooks.find(book => book.id === selectedBook.id)?.stock ??
      selectedBook.stock ??
      10)
    : 0;
  const announce = (message: string) => setNotice(message);

  const toggleWishlist = (book: Book) => {
    setWishlist(current => {
      const next = new Set(current);
      if (next.has(book.id)) {
        next.delete(book.id);
        announce(`${book.title} removed from your wishlist`);
      } else {
        next.add(book.id);
        announce(`${book.title} saved to your wishlist`);
      }
      return next;
    });
    wishlistMutation.mutate(
      { sessionId, bookId: book.id },
      {
        onError: () =>
          announce("We couldn’t save that wishlist change — try again"),
      }
    );
  };

  const addToCart = (book: Book) => {
    if (!canPurchase) return;
    const quantityInCart = cart[book.id] ?? 0;
    const available =
      catalogBooks.find(item => item.id === book.id)?.stock ?? book.stock ?? 10;
    if (quantityInCart >= available) {
      announce(
        available === 0
          ? `${book.title} is out of stock`
          : `Only ${available} copies of ${book.title} are available`
      );
      return;
    }
    setCart(current => ({
      ...current,
      [book.id]: quantityInCart + 1,
    }));
    announce(`${book.title} added to your cart`);
    addToCartMutation.mutate(
      { sessionId, bookId: book.id, quantity: 1 },
      {
        onSuccess: applyStoreState,
        onError: async error => {
          announce(error.message || "We couldn’t save that book to your cart");
          const { data } = await storeStateQuery.refetch();
          if (data) applyStoreState(data);
        },
      }
    );
  };

  const updateQuantity = (bookId: string, change: number) => {
    if (!canPurchase) return;
    const nextQuantity = (cart[bookId] ?? 0) + change;
    const book = catalogBooks.find(item => item.id === bookId);
    if (change > 0 && book && nextQuantity > (book.stock ?? 10)) {
      announce(
        `Only ${book.stock ?? 10} copies of ${book.title} are available`
      );
      return;
    }
    setCart(current => {
      if (nextQuantity <= 0) {
        const { [bookId]: _, ...rest } = current;
        return rest;
      }
      return { ...current, [bookId]: nextQuantity };
    });
    setCartQuantityMutation.mutate(
      { sessionId, bookId, quantity: Math.max(0, nextQuantity) },
      {
        onSuccess: applyStoreState,
        onError: async error => {
          announce(error.message || "We couldn’t update that quantity");
          const { data } = await storeStateQuery.refetch();
          if (data) applyStoreState(data);
        },
      }
    );
  };

  const removeFromCart = (book: Book) => {
    if (!canPurchase) return;
    setCart(current => {
      const { [book.id]: _, ...rest } = current;
      return rest;
    });
    announce(`${book.title} removed from your cart`);
    removeFromCartMutation.mutate(
      { sessionId, bookId: book.id },
      {
        onSuccess: applyStoreState,
        onError: () => announce("We couldn’t remove that book — try again"),
      }
    );
  };

  const startCheckout = () => {
    if (!canPurchase) return;
    if (!cartCount) {
      announce("Your cart is empty — find a book to begin");
      return;
    }
    setCheckoutError("");
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const completeCheckout = async () => {
    if (!canPurchase) return;
    const form = document.getElementById(
      "checkout-form"
    ) as HTMLFormElement | null;
    if (!form || !form.reportValidity()) return;
    const data = new FormData(form);
    try {
      const result = await createOrderMutation.mutateAsync({
        sessionId,
        firstName: String(data.get("firstName") ?? ""),
        lastName: String(data.get("lastName") ?? ""),
        email: String(data.get("email") ?? ""),
        address: String(data.get("address") ?? ""),
        city: String(data.get("city") ?? ""),
        postcode: String(data.get("postcode") ?? ""),
        paymentMethod,
      });
      setCart({});
      setCheckoutError("");
      setCheckoutOpen(false);
      await utils.catalog.list.invalidate();
      await storeStateQuery.refetch();
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
      } else {
        window.location.assign(
          `/order-success/${result.orderId}?simulated=${result.simulated}`
        );
      }
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "We couldn’t save this order yet"
      );
    }
  };

  const selectCategory = (category: BookCategory) => {
    setActiveCategory(category);
    setSearch("");
    document
      .getElementById("browse")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileMenuOpen(false);
  };

  const orderSuccessMatch = /^\/order-success\/(\d+)$/.exec(
    window.location.pathname
  );
  if (orderSuccessMatch) {
    return <OrderConfirmation orderId={Number(orderSuccessMatch[1])} />;
  }

  return (
    <div className="app-shell">
      <div className="announcement">
        <Sparkles size={14} /> New reads, added every week <span>·</span> Free
        shipping on orders over {formatPrice(FREE_SHIPPING_THRESHOLD)}{" "}
        <ArrowRight size={14} />
      </div>
      <header className="site-header">
        <div className="header-main">
          <button
            className="mobile-menu-button icon-button"
            onClick={() => setMobileMenuOpen(open => !open)}
            aria-label={
              mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={mobileMenuOpen}
            aria-controls="primary-navigation"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <button
            className="wordmark"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="codex-geeked home"
          >
            <span className="wordmark__mark">
              <Leaf size={17} />
            </span>
            <span>
              codex <em>–geeked</em>
            </span>
          </button>
          <nav
            id="primary-navigation"
            className={`site-nav ${mobileMenuOpen ? "is-open" : ""}`}
            aria-label="Main navigation"
          >
            <button
              aria-pressed={activeCategory === "All"}
              onClick={() => selectCategory("All")}
            >
              Shop
            </button>
            <button
              aria-pressed={activeCategory === "Fiction"}
              onClick={() => selectCategory("Fiction")}
            >
              Fiction
            </button>
            <button
              aria-pressed={activeCategory === "Nonfiction"}
              onClick={() => selectCategory("Nonfiction")}
            >
              Nonfiction
            </button>
            <button
              aria-pressed={activeCategory === "Food & drink"}
              onClick={() => selectCategory("Food & drink")}
            >
              Food &amp; drink
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                document
                  .getElementById("about")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              About
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                setAccountOpenRequest(request => request + 1);
              }}
            >
              Account &amp; support
            </button>
            {canPurchase && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setCartOpen(true);
                }}
              >
                Your cart {cartCount > 0 ? `(${cartCount})` : ""}
              </button>
            )}
          </nav>
          <div className="header-actions">
            <AccountSupport openRequest={accountOpenRequest} />
            {canPurchase && (
              <button
                className="header-action header-action--bag"
                onClick={() => setCartOpen(true)}
                aria-label={`Open cart, ${cartCount} items`}
              >
                <ShoppingBag size={18} />
                <span>Cart</span>
                {cartCount > 0 && <b>{cartCount}</b>}
              </button>
            )}
          </div>
        </div>
        <div className="header-search">
          <Search size={18} />
          <input
            value={search}
            onChange={event => {
              setSearch(event.target.value);
              setActiveCategory("All");
            }}
            placeholder="Search by title, author, or feeling..."
            aria-label="Search books"
          />
          <span className="search-shortcut">⌘ K</span>
        </div>
      </header>

      <main>
        <section className="hero-section page-width">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow__line" /> The internet&apos;s bookshelf
            </div>
            <h1>
              Find your next <em>deep dive.</em>
            </h1>
            <p className="hero-lede">
              Books, ideas, and rabbit holes for curious minds — a lively
              marketplace with a thoughtfully chosen shelf.
            </p>
            <div className="hero-actions">
              <button
                className="button button--primary"
                onClick={() =>
                  document
                    .getElementById("browse")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Browse the shelves <ArrowRight size={17} />
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setSort("newest");
                  selectCategory("All");
                }}
              >
                Fresh drops <ChevronDown size={15} />
              </button>
            </div>
            <div className="hero-proof">
              <div className="avatar-stack">
                <span>J</span>
                <span>M</span>
                <span>S</span>
                <span>+</span>
              </div>
              <p>
                <strong>4.9/5</strong> from readers who like a good story
              </p>
            </div>
          </div>
          <div className="hero-art" aria-label="A selection of featured books">
            <div className="hero-scribble">
              Trending now <ArrowRight size={14} />
            </div>
            <div className="hero-leaf hero-leaf--one" />
            <div className="hero-leaf hero-leaf--two" />
            <div className="hero-book hero-book--back">
              <BookCover book={featuredBooks[3]} size="hero" />
            </div>
            <div className="hero-book hero-book--middle">
              <BookCover book={featuredBooks[1]} size="hero" />
            </div>
            <div className="hero-book hero-book--front">
              <BookCover book={featuredBooks[0]} size="hero" />
            </div>
            <div className="hero-note">
              <span>01</span>
              <strong>Take your time.</strong>
              <small>There&apos;s no rush to find the right one.</small>
            </div>
          </div>
        </section>

        <section
          className="category-ribbon page-width"
          aria-label="Browse categories"
        >
          <div className="category-intro">
            <span>Start here</span>
            <strong>What are you in the mood for?</strong>
          </div>
          {categories.slice(1).map(category => (
            <button
              key={category}
              className="category-chip"
              onClick={() => selectCategory(category)}
            >
              <span
                className={`category-chip__dot category-chip__dot--${category.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              />
              {category}
              <ArrowRight size={15} />
            </button>
          ))}
        </section>

        <section className="section-block section-block--featured page-width">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow__line" /> Trending now
              </div>
              <h2>
                Community <em>favourites.</em>
              </h2>
            </div>
            <button
              className="text-button"
              onClick={() => selectCategory("All")}
            >
              View all books <ArrowRight size={15} />
            </button>
          </div>
          <div className="featured-grid">
            {(showAllFeatured ? catalogBooks : featuredBooks.slice(0, 4)).map(
              book => (
                <BookCard
                  key={book.id}
                  book={book}
                  wished={wishlist.has(book.id)}
                  onWishlist={toggleWishlist}
                  onAdd={addToCart}
                  onOpen={setSelectedBook}
                  quantityInCart={cart[book.id] ?? 0}
                  canPurchase={canPurchase}
                />
              )
            )}
          </div>
          {!showAllFeatured && (
            <button
              className="shelf-more"
              onClick={() => setShowAllFeatured(true)}
            >
              Show the whole shelf <Plus size={16} />
            </button>
          )}
        </section>

        <section className="quote-section page-width">
          <div className="quote-mark">“</div>
          <blockquote>
            A good book can turn a passing interest into a whole new world to
            explore.
          </blockquote>
          <div className="quote-credit">
            <span /> A note from the codex-geeked crew
          </div>
        </section>

        <section className="section-block page-width" id="browse">
          <div className="section-heading section-heading--browse">
            <div>
              <div className="eyebrow">
                <span className="eyebrow__line" /> Make a discovery
              </div>
              <h2>
                Browse the <em>shelves.</em>
              </h2>
              <p className="section-subcopy">
                A little bit of everything, arranged for the way you feel today.
              </p>
            </div>
            <div className="browse-count">
              <strong>{filteredBooks.length}</strong> books on this shelf
            </div>
          </div>
          <div className="browse-toolbar">
            <div className="category-tabs">
              {categories.map(category => (
                <button
                  key={category}
                  className={activeCategory === category ? "is-active" : ""}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="toolbar-controls">
              <label>
                <span>Price</span>
                <select
                  value={priceFilter}
                  onChange={event =>
                    setPriceFilter(event.target.value as PriceFilter)
                  }
                >
                  <option value="all">All prices</option>
                  <option value="under-700">Under ₱700</option>
                  <option value="700-1200">₱700–₱1,200</option>
                  <option value="over-1200">Over ₱1,200</option>
                </select>
                <ChevronDown size={13} />
              </label>
              <label>
                <span>Sort by</span>
                <select
                  value={sort}
                  onChange={event => setSort(event.target.value as SortOption)}
                >
                  <option value="featured">Featured</option>
                  <option value="newest">Newest</option>
                  <option value="rating">Top rated</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
          </div>
          {filteredBooks.length > 0 ? (
            <div className="book-grid">
              {filteredBooks.map(book => (
                <BookCard
                  key={book.id}
                  book={book}
                  wished={wishlist.has(book.id)}
                  onWishlist={toggleWishlist}
                  onAdd={addToCart}
                  onOpen={setSelectedBook}
                  quantityInCart={cart[book.id] ?? 0}
                  canPurchase={canPurchase}
                />
              ))}
            </div>
          ) : (
            <div className="empty-search">
              <BookOpen size={32} />
              <h3>No books found on this shelf.</h3>
              <p>Try a different title, author, or price range.</p>
              <button
                className="button button--secondary"
                onClick={() => {
                  setSearch("");
                  setActiveCategory("All");
                  setPriceFilter("all");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        <section className="story-section page-width" id="about">
          <div className="story-illustration">
            <div className="story-circle" />
            <Leaf className="story-leaf" size={78} />
            <div className="story-stamp">
              Est.
              <br />
              <strong>2018</strong>
            </div>
          </div>
          <div className="story-copy">
            <div className="eyebrow">
              <span className="eyebrow__line" /> About codex-geeked
            </div>
            <h2>
              Follow your curiosity. <em>See where it goes.</em>
            </h2>
            <p>
              We bring together books for readers who love to explore. Find a
              new author, follow an unexpected idea, or pick up a story you
              can’t stop thinking about — your next discovery is only a few
              pages away.
            </p>
            <button
              className="text-button"
              onClick={() =>
                announce("Our booksellers are always happy to help")
              }
            >
              Meet the booksellers <ArrowRight size={15} />
            </button>
          </div>
        </section>

        <section className="newsletter-section page-width">
          <div>
            <div className="eyebrow eyebrow--light">
              <span className="eyebrow__line" /> A note worth opening
            </div>
            <h2>Good books, occasionally.</h2>
            <p>
              A small, well-edited letter with new arrivals, bookseller notes,
              and things to read next.
            </p>
          </div>
          <form
            className="newsletter-form"
            onSubmit={event => {
              event.preventDefault();
              announce("You’re on the list — see you in your inbox");
            }}
          >
            <input
              type="email"
              required
              placeholder="Your email address"
              aria-label="Email address"
            />
            <button type="submit" className="button button--yellow">
              Sign me up <ArrowRight size={16} />
            </button>
            <small>Once or twice a month. No noise.</small>
          </form>
        </section>
      </main>

      <footer className="site-footer page-width">
        <div className="footer-brand">
          <button
            className="wordmark"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <span className="wordmark__mark">
              <Leaf size={17} />
            </span>
            <span>
              codex <em>–geeked</em>
            </span>
          </button>
          <p>For curious minds and their next great read.</p>
        </div>
        <div className="footer-links">
          <div>
            <strong>Shop</strong>
            <button onClick={() => selectCategory("All")}>All books</button>
            <button onClick={() => selectCategory("Fiction")}>Fiction</button>
            <button onClick={() => selectCategory("Nonfiction")}>
              Nonfiction
            </button>
          </div>
          <div>
            <strong>Need a hand?</strong>
            <button
              onClick={() =>
                announce("Our booksellers reply within one working day")
              }
            >
              Contact us
            </button>
            <button onClick={() => announce("Gift cards are coming soon")}>
              Gift cards
            </button>
            <button
              onClick={() => announce("Delivery details are always clear")}
            >
              Delivery &amp; returns
            </button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 codex-geeked</span>
          <span>Made for curious readers.</span>
        </div>
      </footer>

      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} /> {notice}
        </div>
      )}

      {selectedBook && (
        <div className="modal-backdrop" onClick={() => setSelectedBook(null)}>
          <div
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedBook.title} details`}
            onClick={event => event.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              onClick={() => setSelectedBook(null)}
              aria-label="Close book details"
            >
              <X size={19} />
            </button>
            <div className="detail-modal__cover">
              <BookCover book={selectedBook} size="detail" />
              {selectedBook.badge && (
                <span className="detail-badge">
                  <Sparkles size={13} /> {selectedBook.badge}
                </span>
              )}
            </div>
            <div className="detail-modal__body">
              <div className="book-card__meta">
                <span>{selectedBook.category}</span>
                <span className="rating">
                  <Star size={12} fill="currentColor" /> {selectedBook.rating}{" "}
                  <small>({selectedBook.reviews})</small>
                </span>
              </div>
              <h2>{selectedBook.title}</h2>
              <p className="detail-author">by {selectedBook.author}</p>
              <p className="detail-description">{selectedBook.description}</p>
              <p
                className={`book-stock${selectedBookStock === 0 ? " is-out" : selectedBookStock < 5 ? " is-low" : ""}`}
              >
                {selectedBookStock === 0
                  ? "Out of stock"
                  : selectedBookStock < 5
                    ? `Low stock: ${selectedBookStock} left`
                    : `${selectedBookStock} available`}
              </p>
              <div className="detail-specs">
                <span>
                  <strong>{selectedBook.pages}</strong> pages
                </span>
                <span>
                  <strong>{selectedBook.format}</strong> edition
                </span>
                <span>
                  <strong>{selectedBook.published}</strong> published
                </span>
              </div>
              <div className="detail-tags">
                {selectedBook.tags.map(tag => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
              {canPurchase && (
                <div className="detail-purchase">
                  <strong>{formatPrice(selectedBook.price)}</strong>
                  <button
                    className="button button--primary"
                    disabled={
                      selectedBookStock === 0 ||
                      (cart[selectedBook.id] ?? 0) >= selectedBookStock
                    }
                    onClick={() => {
                      addToCart(selectedBook);
                      setSelectedBook(null);
                    }}
                  >
                    Add to cart <Plus size={16} />
                  </button>
                </div>
              )}
              <button
                className={`wishlist-link ${wishlist.has(selectedBook.id) ? "is-wished" : ""}`}
                onClick={() => toggleWishlist(selectedBook)}
              >
                <Heart
                  size={16}
                  fill={wishlist.has(selectedBook.id) ? "currentColor" : "none"}
                />{" "}
                {wishlist.has(selectedBook.id)
                  ? "Saved to your wishlist"
                  : "Save for later"}
              </button>
            </div>
          </div>
        </div>
      )}

      {canPurchase && cartOpen && (
        <div className="drawer-backdrop" onClick={() => setCartOpen(false)}>
          <aside
            className="cart-drawer"
            onClick={event => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <span className="eyebrow">
                  <span className="eyebrow__line" /> Your cart
                </span>
                <h2>
                  {cartCount
                    ? `${cartCount} ${cartCount === 1 ? "book" : "books"}`
                    : "It’s quiet in here"}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setCartOpen(false)}
                aria-label="Close cart"
              >
                <X size={20} />
              </button>
            </div>
            {cartItems.length > 0 ? (
              <>
                <div className="cart-list">
                  {cartItems.map(book => (
                    <div className="cart-item" key={book.id}>
                      <div className="cart-item__cover">
                        <BookCover book={book} size="card" />
                      </div>
                      <div className="cart-item__body">
                        <div>
                          <strong>{book.title}</strong>
                          <span>{book.author}</span>
                        </div>
                        <button
                          className="cart-item__remove"
                          onClick={() => removeFromCart(book)}
                          aria-label={`Remove ${book.title}`}
                        >
                          <Trash2 size={14} />
                        </button>
                        <div className="cart-item__bottom">
                          <span className="cart-item__note">
                            {formatPrice(book.price * cart[book.id])}
                          </span>
                          <div className="quantity-control">
                            <button
                              onClick={() => updateQuantity(book.id, -1)}
                              aria-label="Decrease quantity"
                            >
                              <Minus size={13} />
                            </button>
                            <span>{cart[book.id]}</span>
                            <button
                              onClick={() => updateQuantity(book.id, 1)}
                              aria-label="Increase quantity"
                              disabled={
                                (cart[book.id] ?? 0) >= (book.stock ?? 10)
                              }
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-benefit">
                  <BookOpen size={16} />
                  <span>
                    {cartShipping === 0
                      ? "Your order qualifies for free shipping."
                      : `Add ${formatPrice(FREE_SHIPPING_THRESHOLD + 1 - cartSubtotal)} for free shipping.`}
                  </span>
                </div>
                <div className="cart-summary">
                  <div className="cart-summary__totals">
                    <span>Subtotal</span>
                    <strong>{formatPrice(cartSubtotal)}</strong>
                    <span>Shipping</span>
                    <strong>
                      {cartShipping === 0 ? "Free" : formatPrice(cartShipping)}
                    </strong>
                    <span className="cart-summary__total-label">Total</span>
                    <strong className="cart-summary__total">
                      {formatPrice(cartTotal)}
                    </strong>
                  </div>
                  <button
                    className="button button--primary button--full"
                    onClick={startCheckout}
                  >
                    Continue to checkout <ArrowRight size={16} />
                  </button>
                  <small>
                    <ShieldCheck size={13} /> Secure payment by PayMongo
                  </small>
                </div>
              </>
            ) : (
              <div className="cart-empty">
                <div className="cart-empty__icon">
                  <ShoppingBag size={25} />
                </div>
                <h3>Your cart is waiting.</h3>
                <p>
                  When a book catches your eye, add it here and we&apos;ll keep
                  it safe.
                </p>
                <button
                  className="button button--secondary"
                  onClick={() => {
                    setCartOpen(false);
                    document
                      .getElementById("browse")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Browse books <ArrowRight size={16} />
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {canPurchase && checkoutOpen && (
        <div className="modal-backdrop" onClick={() => setCheckoutOpen(false)}>
          <div
            className="checkout-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Checkout preview"
            onClick={event => event.stopPropagation()}
          >
            <div className="checkout-top">
              <button
                className="back-button"
                onClick={() => {
                  setCheckoutOpen(false);
                  setCartOpen(true);
                }}
              >
                <ChevronLeft size={17} /> Back to cart
              </button>
              <button
                className="icon-button"
                onClick={() => setCheckoutOpen(false)}
                aria-label="Close checkout"
              >
                <X size={19} />
              </button>
            </div>
            <div className="checkout-content">
              <form
                id="checkout-form"
                className="checkout-form"
                onSubmit={event => {
                  event.preventDefault();
                  void completeCheckout();
                }}
              >
                <div className="eyebrow">
                  <span className="eyebrow__line" /> Nearly there
                </div>
                <h2>Make room for good things.</h2>
                <p className="checkout-intro">
                  Pay securely through PayMongo. Your order is marked paid only
                  after the store receives a verified payment confirmation.
                </p>
                <div className="form-section">
                  <span className="form-label">1. Delivery details</span>
                  <p className="checkout-intro">
                    Delivery is available within the Philippines only. Most
                    orders arrive in 3–7 business days.
                  </p>
                  <div className="form-grid">
                    <label>
                      First name
                      <input name="firstName" placeholder="Ada" required />
                    </label>
                    <label>
                      Last name
                      <input name="lastName" placeholder="Lovelace" required />
                    </label>
                    <label className="form-grid__full">
                      Email address
                      <input
                        name="email"
                        type="email"
                        placeholder="ada@example.com"
                        required
                      />
                    </label>
                    <label className="form-grid__full">
                      Address
                      <input
                        name="address"
                        placeholder="12 Mabini Street"
                        required
                      />
                    </label>
                    <label>
                      City
                      <input name="city" placeholder="Manila" required />
                    </label>
                    <label>
                      Postcode
                      <input
                        name="postcode"
                        placeholder="1000"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        required
                      />
                    </label>
                  </div>
                </div>
                <div className="form-section">
                  <span className="form-label">2. Secure payment</span>
                  <div
                    className="payment-methods"
                    role="radiogroup"
                    aria-label="Payment method"
                  >
                    {CHECKOUT_PAYMENT_METHODS.filter(
                      method => method !== "sandbox" || import.meta.env.DEV
                    ).map(method => (
                      <label
                        key={method}
                        className={`payment-method${paymentMethod === method ? " is-selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method}
                          checked={paymentMethod === method}
                          onChange={() => setPaymentMethod(method)}
                        />
                        <span
                          className="payment-method__mark"
                          aria-hidden="true"
                        >
                          {method === "card" ? (
                            <CreditCard size={19} />
                          ) : method === "sandbox" ? (
                            <ShieldCheck size={19} />
                          ) : (
                            <Smartphone size={19} />
                          )}
                        </span>
                        <span className="payment-method__copy">
                          <strong>{PAYMENT_METHOD_LABELS[method]}</strong>
                          <small>
                            {method === "sandbox"
                              ? "Simulated payment for local development"
                              : import.meta.env.DEV
                                ? "PayMongo checkout; simulated locally if unavailable"
                                : "Pay securely through PayMongo"}
                          </small>
                        </span>
                        <span className="payment-method__radio" />
                      </label>
                    ))}
                  </div>
                </div>
                {checkoutError && (
                  <p className="checkout-error">{checkoutError}</p>
                )}
                <button
                  type="submit"
                  className="button button--primary button--full"
                  disabled={createOrderMutation.isPending}
                >
                  {createOrderMutation.isPending
                    ? "Preparing secure checkout…"
                    : "Continue to secure payment"}{" "}
                  <ArrowRight size={16} />
                </button>
              </form>
              <div className="checkout-order">
                <div className="checkout-order__heading">
                  <span>Your cart</span>
                  <span>
                    {cartCount} {cartCount === 1 ? "book" : "books"}
                  </span>
                </div>
                {cartItems.map(book => (
                  <div className="checkout-line" key={book.id}>
                    <div className="checkout-line__cover">
                      <BookCover book={book} size="card" />
                      <span>{cart[book.id]}</span>
                    </div>
                    <div>
                      <strong>{book.title}</strong>
                      <span>{book.author}</span>
                    </div>
                    <b>{formatPrice(book.price * cart[book.id])}</b>
                  </div>
                ))}
                <div className="checkout-perks">
                  <span>
                    <Gift size={15} /> Wrapped with care
                  </span>
                  <span>
                    <Truck size={15} /> Philippines delivery · 3–7 business days
                  </span>
                </div>
                <div className="checkout-totals">
                  <div>
                    <span>Subtotal</span>
                    <strong>{formatPrice(cartSubtotal)}</strong>
                  </div>
                  <div>
                    <span>Shipping</span>
                    <strong>
                      {cartShipping === 0 ? "Free" : formatPrice(cartShipping)}
                    </strong>
                  </div>
                  <div className="checkout-grand-total">
                    <span>Total</span>
                    <strong>{formatPrice(cartTotal)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
