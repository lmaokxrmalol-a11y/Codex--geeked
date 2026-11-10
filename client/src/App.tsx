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
  Sparkles,
  Star,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import BookCard from "./components/BookCard";
import BookCover from "./components/BookCover";
import { books, categories, type Book, type BookCategory } from "./data/books";
import { trpc } from "./lib/trpc";

type SortOption = "featured" | "rating" | "newest";

function getBookshopSessionId() {
  const storageKey = "leaf-lore-session-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const sessionId = `${crypto.randomUUID()}-${Date.now()}`;
  window.localStorage.setItem(storageKey, sessionId);
  return sessionId;
}

export default function App() {
  const sessionId = useMemo(() => getBookshopSessionId(), []);
  const [activeCategory, setActiveCategory] = useState<BookCategory>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("featured");
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAllFeatured, setShowAllFeatured] = useState(false);
  const [storeHydrated, setStoreHydrated] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const catalogQuery = trpc.catalog.list.useQuery();
  const storeStateQuery = trpc.store.state.useQuery({ sessionId });
  const wishlistMutation = trpc.store.toggleWishlist.useMutation();
  const addToCartMutation = trpc.store.addToCart.useMutation();
  const setCartQuantityMutation = trpc.store.setCartQuantity.useMutation();
  const removeFromCartMutation = trpc.store.removeFromCart.useMutation();
  const createOrderMutation = trpc.checkout.createOrder.useMutation();

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".header-search input")?.focus();
      }
      if (event.key === "Escape") {
        setSelectedBook(null);
        setCartOpen(false);
        setCheckoutOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const catalogBooks = catalogQuery.data ?? books;
  const featuredBooks = useMemo(() => catalogBooks.filter((book) => book.featured), [catalogBooks]);

  useEffect(() => {
    if (!storeStateQuery.data || storeHydrated) return;
    setWishlist(new Set(storeStateQuery.data.wishlistIds));
    setCart(Object.fromEntries(storeStateQuery.data.cart.map((item) => [item.bookId, item.quantity])));
    setStoreHydrated(true);
  }, [storeHydrated, storeStateQuery.data]);

  const applyStoreState = (state: { wishlistIds: string[]; cart: Array<{ bookId: string; quantity: number }> }) => {
    setWishlist(new Set(state.wishlistIds));
    setCart(Object.fromEntries(state.cart.map((item) => [item.bookId, item.quantity])));
    setStoreHydrated(true);
  };

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = catalogBooks.filter((book) => {
      const matchesCategory = activeCategory === "All" || book.category === activeCategory;
      const matchesQuery = !query || [book.title, book.author, book.summary, book.category, ...book.tags].join(" ").toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });

    return [...result].sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "newest") return Number(b.published) - Number(a.published);
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    });
  }, [activeCategory, catalogBooks, search, sort]);

  const cartItems = useMemo(() => catalogBooks.filter((book) => cart[book.id]), [cart, catalogBooks]);
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const announce = (message: string) => setNotice(message);

  const toggleWishlist = (book: Book) => {
    setWishlist((current) => {
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
    wishlistMutation.mutate({ sessionId, bookId: book.id }, {
      onError: () => announce("We couldn’t save that wishlist change — try again"),
    });
  };

  const addToCart = (book: Book) => {
    setCart((current) => ({ ...current, [book.id]: (current[book.id] ?? 0) + 1 }));
    announce(`${book.title} added to your stack`);
    addToCartMutation.mutate({ sessionId, bookId: book.id, quantity: 1 }, {
      onSuccess: applyStoreState,
      onError: () => announce("We couldn’t save that book to your stack — try again"),
    });
  };

  const updateQuantity = (bookId: string, change: number) => {
    const nextQuantity = (cart[bookId] ?? 0) + change;
    setCart((current) => {
      if (nextQuantity <= 0) {
        const { [bookId]: _, ...rest } = current;
        return rest;
      }
      return { ...current, [bookId]: nextQuantity };
    });
    setCartQuantityMutation.mutate({ sessionId, bookId, quantity: Math.max(0, nextQuantity) }, {
      onSuccess: applyStoreState,
      onError: () => announce("We couldn’t update that quantity — try again"),
    });
  };

  const removeFromCart = (book: Book) => {
    setCart((current) => {
      const { [book.id]: _, ...rest } = current;
      return rest;
    });
    announce(`${book.title} removed from your stack`);
    removeFromCartMutation.mutate({ sessionId, bookId: book.id }, {
      onSuccess: applyStoreState,
      onError: () => announce("We couldn’t remove that book — try again"),
    });
  };

  const startCheckout = () => {
    if (!cartCount) {
      announce("Your stack is empty — find a book to begin");
      return;
    }
    setCheckoutError("");
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const completeCheckout = async () => {
    const form = document.getElementById("checkout-form") as HTMLFormElement | null;
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
      });
      setCart({});
      setCheckoutError("");
      setCheckoutOpen(false);
      await storeStateQuery.refetch();
      announce(`Preview order #${result.orderId} saved — no payment was taken`);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "We couldn’t save this order yet");
    }
  };

  const selectCategory = (category: BookCategory) => {
    setActiveCategory(category);
    setSearch("");
    document.getElementById("browse")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-shell">
      <div className="announcement"><Sparkles size={14} /> Thoughtful books, sent with care <span>·</span> Curated for curious readers <ArrowRight size={14} /></div>
      <header className="site-header">
        <div className="header-main">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Toggle menu"><Menu size={20} /></button>
          <button className="wordmark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Leaf and Lore home"><span className="wordmark__mark"><Leaf size={17} /></span><span>leaf <em>&amp;</em> lore</span></button>
          <nav className={`site-nav ${mobileMenuOpen ? "is-open" : ""}`}>
            <button onClick={() => selectCategory("All")}>Shop all</button>
            <button onClick={() => selectCategory("Fiction")}>Fiction</button>
            <button onClick={() => selectCategory("Nonfiction")}>Nonfiction</button>
            <button onClick={() => selectCategory("Food & drink")}>Food &amp; drink</button>
            <button onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })}>Our story</button>
          </nav>
          <div className="header-actions">
            <button className="header-action" aria-label="Account"><UserRound size={18} /><span>Account</span></button>
            <button className="header-action header-action--bag" onClick={() => setCartOpen(true)} aria-label={`Open stack, ${cartCount} items`}><ShoppingBag size={18} /><span>Stack</span>{cartCount > 0 && <b>{cartCount}</b>}</button>
          </div>
        </div>
        <div className="header-search">
          <Search size={18} />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setActiveCategory("All"); }} placeholder="Search by title, author, or feeling..." aria-label="Search books" />
          <span className="search-shortcut">⌘ K</span>
        </div>
      </header>

      <main>
        <section className="hero-section page-width">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow__line" /> A bookshop for the curious</div>
            <h1>Find your next <em>good thing.</em></h1>
            <p className="hero-lede">Books with a little more staying power — chosen for slow mornings, big questions, and the people you love to talk to.</p>
            <div className="hero-actions"><button className="button button--primary" onClick={() => document.getElementById("browse")?.scrollIntoView({ behavior: "smooth" })}>Browse the shelves <ArrowRight size={17} /></button><button className="text-button" onClick={() => selectCategory("All")}>See what&apos;s new <ChevronDown size={15} /></button></div>
            <div className="hero-proof"><div className="avatar-stack"><span>J</span><span>M</span><span>S</span><span>+</span></div><p><strong>4.9/5</strong> from readers who like a good story</p></div>
          </div>
          <div className="hero-art" aria-label="A selection of featured books">
            <div className="hero-scribble">Staff picks <ArrowRight size={14} /></div>
            <div className="hero-leaf hero-leaf--one" /><div className="hero-leaf hero-leaf--two" />
            <div className="hero-book hero-book--back"><BookCover book={featuredBooks[3]} size="hero" /></div>
            <div className="hero-book hero-book--middle"><BookCover book={featuredBooks[1]} size="hero" /></div>
            <div className="hero-book hero-book--front"><BookCover book={featuredBooks[0]} size="hero" /></div>
            <div className="hero-note"><span>01</span><strong>Take your time.</strong><small>There&apos;s no rush to find the right one.</small></div>
          </div>
        </section>

        <section className="category-ribbon page-width" aria-label="Browse categories">
          <div className="category-intro"><span>Start here</span><strong>What are you in the mood for?</strong></div>
          {categories.slice(1).map((category) => <button key={category} className="category-chip" onClick={() => selectCategory(category)}><span className={`category-chip__dot category-chip__dot--${category.toLowerCase().replace(/[^a-z]+/g, "-")}`} />{category}<ArrowRight size={15} /></button>)}
        </section>

        <section className="section-block section-block--featured page-width">
          <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow__line" /> On the table</div><h2>Our latest <em>favourites.</em></h2></div><button className="text-button" onClick={() => selectCategory("All")}>View all books <ArrowRight size={15} /></button></div>
          <div className="featured-grid">{(showAllFeatured ? books : featuredBooks.slice(0, 4)).map((book) => <BookCard key={book.id} book={book} wished={wishlist.has(book.id)} onWishlist={toggleWishlist} onAdd={addToCart} onOpen={setSelectedBook} />)}</div>
          {!showAllFeatured && <button className="shelf-more" onClick={() => setShowAllFeatured(true)}>Show the whole shelf <Plus size={16} /></button>}
        </section>

        <section className="quote-section page-width"><div className="quote-mark">“</div><blockquote>The best books don&apos;t just tell you a story. They give you a new way to look at the room you&apos;re already in.</blockquote><div className="quote-credit"><span /> A note from the Leaf &amp; Lore booksellers</div></section>

        <section className="section-block page-width" id="browse">
          <div className="section-heading section-heading--browse"><div><div className="eyebrow"><span className="eyebrow__line" /> Make a discovery</div><h2>Browse the <em>shelves.</em></h2><p className="section-subcopy">A little bit of everything, arranged for the way you feel today.</p></div><div className="browse-count"><strong>{filteredBooks.length}</strong> books on this shelf</div></div>
          <div className="browse-toolbar">
            <div className="category-tabs">{categories.map((category) => <button key={category} className={activeCategory === category ? "is-active" : ""} onClick={() => setActiveCategory(category)}>{category}</button>)}</div>
            <div className="toolbar-controls"><label><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="featured">Featured</option><option value="newest">Newest</option><option value="rating">Top rated</option></select><ChevronDown size={13} /></label></div>
          </div>
          {filteredBooks.length > 0 ? <div className="book-grid">{filteredBooks.map((book) => <BookCard key={book.id} book={book} wished={wishlist.has(book.id)} onWishlist={toggleWishlist} onAdd={addToCart} onOpen={setSelectedBook} />)}</div> : <div className="empty-search"><BookOpen size={32} /><h3>No books found on this shelf.</h3><p>Try a different title, author, or category.</p><button className="button button--secondary" onClick={() => { setSearch(""); setActiveCategory("All"); }}>Clear filters</button></div>}
        </section>

        <section className="story-section page-width" id="about"><div className="story-illustration"><div className="story-circle" /><Leaf className="story-leaf" size={78} /><div className="story-stamp">Est.<br /><strong>2018</strong></div></div><div className="story-copy"><div className="eyebrow"><span className="eyebrow__line" /> The short version</div><h2>A good bookshop should feel like a <em>conversation.</em></h2><p>Leaf &amp; Lore started with a small shelf, a big stack of recommendations, and the belief that finding a book should be part of the pleasure. We choose stories with heart, ideas with legs, and cookbooks that make you want to call someone.</p><button className="text-button" onClick={() => announce("Our booksellers are always happy to help")}>Meet the booksellers <ArrowRight size={15} /></button></div></section>

        <section className="newsletter-section page-width"><div><div className="eyebrow eyebrow--light"><span className="eyebrow__line" /> A note worth opening</div><h2>Good books, occasionally.</h2><p>A small, well-edited letter with new arrivals, bookseller notes, and things to read next.</p></div><form className="newsletter-form" onSubmit={(event) => { event.preventDefault(); announce("You’re on the list — see you in your inbox"); }}><input type="email" required placeholder="Your email address" aria-label="Email address" /><button type="submit" className="button button--yellow">Sign me up <ArrowRight size={16} /></button><small>Once or twice a month. No noise.</small></form></section>
      </main>

      <footer className="site-footer page-width"><div className="footer-brand"><button className="wordmark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span className="wordmark__mark"><Leaf size={17} /></span><span>leaf <em>&amp;</em> lore</span></button><p>For the stories that stay with you.</p></div><div className="footer-links"><div><strong>Shop</strong><button onClick={() => selectCategory("All")}>All books</button><button onClick={() => selectCategory("Fiction")}>Fiction</button><button onClick={() => selectCategory("Nonfiction")}>Nonfiction</button></div><div><strong>Need a hand?</strong><button onClick={() => announce("Our booksellers reply within one working day")}>Contact us</button><button onClick={() => announce("Gift cards are coming soon")}>Gift cards</button><button onClick={() => announce("Delivery details are always clear")}>Delivery &amp; returns</button></div></div><div className="footer-bottom"><span>© 2024 Leaf &amp; Lore</span><span>Made for readers, wherever they are.</span></div></footer>

      {notice && <div className="toast" role="status"><CheckCircle2 size={17} /> {notice}</div>}

      {selectedBook && <div className="modal-backdrop" onClick={() => setSelectedBook(null)}><div className="detail-modal" role="dialog" aria-modal="true" aria-label={`${selectedBook.title} details`} onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={() => setSelectedBook(null)} aria-label="Close book details"><X size={19} /></button><div className="detail-modal__cover"><BookCover book={selectedBook} size="detail" />{selectedBook.badge && <span className="detail-badge"><Sparkles size={13} /> {selectedBook.badge}</span>}</div><div className="detail-modal__body"><div className="book-card__meta"><span>{selectedBook.category}</span><span className="rating"><Star size={12} fill="currentColor" /> {selectedBook.rating} <small>({selectedBook.reviews})</small></span></div><h2>{selectedBook.title}</h2><p className="detail-author">by {selectedBook.author}</p><p className="detail-description">{selectedBook.description}</p><div className="detail-specs"><span><strong>{selectedBook.pages}</strong> pages</span><span><strong>{selectedBook.format}</strong> edition</span><span><strong>{selectedBook.published}</strong> published</span></div><div className="detail-tags">{selectedBook.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div><div className="detail-purchase"><span className="detail-purchase-note">Add this book to your stack</span><button className="button button--primary" onClick={() => { addToCart(selectedBook); setSelectedBook(null); }}>Add to stack <Plus size={16} /></button></div><button className={`wishlist-link ${wishlist.has(selectedBook.id) ? "is-wished" : ""}`} onClick={() => toggleWishlist(selectedBook)}><Heart size={16} fill={wishlist.has(selectedBook.id) ? "currentColor" : "none"} /> {wishlist.has(selectedBook.id) ? "Saved to your wishlist" : "Save for later"}</button></div></div></div>}

      {cartOpen && <div className="drawer-backdrop" onClick={() => setCartOpen(false)}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow"><span className="eyebrow__line" /> Your reading stack</span><h2>{cartCount ? `${cartCount} ${cartCount === 1 ? "book" : "books"}` : "It’s quiet in here"}</h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close shopping stack"><X size={20} /></button></div>{cartItems.length > 0 ? <><div className="cart-list">{cartItems.map((book) => <div className="cart-item" key={book.id}><div className="cart-item__cover"><BookCover book={book} size="card" /></div><div className="cart-item__body"><div><strong>{book.title}</strong><span>{book.author}</span></div><button className="cart-item__remove" onClick={() => removeFromCart(book)} aria-label={`Remove ${book.title}`}><Trash2 size={14} /></button><div className="cart-item__bottom"><span className="cart-item__note">Quantity</span><div className="quantity-control"><button onClick={() => updateQuantity(book.id, -1)} aria-label="Decrease quantity"><Minus size={13} /></button><span>{cart[book.id]}</span><button onClick={() => updateQuantity(book.id, 1)} aria-label="Increase quantity"><Plus size={13} /></button></div></div></div></div>)}</div><div className="cart-benefit"><BookOpen size={16} /><span>Your books are saved in this reading stack.</span></div><div className="cart-summary"><div className="cart-summary__label">Your reading stack is ready</div><button className="button button--primary button--full" onClick={startCheckout}>Continue to checkout <ArrowRight size={16} /></button><small><ShieldCheck size={13} /> Secure checkout preview · no payment taken</small></div></> : <div className="cart-empty"><div className="cart-empty__icon"><BookOpen size={25} /></div><h3>Your stack is waiting.</h3><p>When a book catches your eye, add it here and we&apos;ll keep it safe.</p><button className="button button--secondary" onClick={() => { setCartOpen(false); document.getElementById("browse")?.scrollIntoView({ behavior: "smooth" }); }}>Browse books <ArrowRight size={16} /></button></div>}</aside></div>}

      {checkoutOpen && <div className="modal-backdrop" onClick={() => setCheckoutOpen(false)}><div className="checkout-modal" role="dialog" aria-modal="true" aria-label="Checkout preview" onClick={(event) => event.stopPropagation()}><div className="checkout-top"><button className="back-button" onClick={() => { setCheckoutOpen(false); setCartOpen(true); }}><ChevronLeft size={17} /> Back to stack</button><button className="icon-button" onClick={() => setCheckoutOpen(false)} aria-label="Close checkout"><X size={19} /></button></div><div className="checkout-content"><form id="checkout-form" className="checkout-form" onSubmit={(event) => { event.preventDefault(); void completeCheckout(); }}><div className="eyebrow"><span className="eyebrow__line" /> Nearly there</div><h2>Make room for good things.</h2><p className="checkout-intro">This saves a pending order to the bookshop database — no payment will be processed.</p><div className="form-section"><span className="form-label">1. Delivery details</span><div className="form-grid"><label>First name<input name="firstName" placeholder="Ada" required /></label><label>Last name<input name="lastName" placeholder="Lovelace" required /></label><label className="form-grid__full">Email address<input name="email" type="email" placeholder="ada@example.com" required /></label><label className="form-grid__full">Address<input name="address" placeholder="12 Willow Lane" required /></label><label>City<input name="city" placeholder="London" required /></label><label>Postcode<input name="postcode" placeholder="NW1 4RT" required /></label></div></div><div className="form-section"><span className="form-label">2. Payment method</span><div className="payment-placeholder"><CreditCard size={19} /><div><strong>Card payment</strong><span>Secure card fields appear here at checkout.</span></div><CheckCircle2 size={18} /></div></div>{checkoutError && <p className="checkout-error">{checkoutError}</p>}<button type="submit" className="button button--primary button--full" disabled={createOrderMutation.isPending}>{createOrderMutation.isPending ? "Saving preview order…" : "Place preview order"} <ArrowRight size={16} /></button></form><div className="checkout-order"><div className="checkout-order__heading"><span>Your stack</span><span>{cartCount} {cartCount === 1 ? "book" : "books"}</span></div>{cartItems.map((book) => <div className="checkout-line" key={book.id}><div className="checkout-line__cover"><BookCover book={book} size="card" /><span>{cart[book.id]}</span></div><div><strong>{book.title}</strong><span>{book.author}</span></div></div>)}<div className="checkout-perks"><span><Gift size={15} /> Wrapped with care</span><span><Truck size={15} /> Ships in 2–3 days</span></div></div></div></div></div>}
    </div>
  );
}
