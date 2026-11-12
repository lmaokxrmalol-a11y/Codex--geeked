import { Heart, Plus, ShoppingCart, Star } from "lucide-react";
import type { Book } from "../data/books";
import { formatPrice } from "../lib/currency";
import BookCover from "./BookCover";

type BookCardProps = {
  book: Book;
  wished: boolean;
  onWishlist: (book: Book) => void;
  onAdd: (book: Book) => void;
  onOpen: (book: Book) => void;
  quantityInCart?: number;
};

export default function BookCard({
  book,
  wished,
  onWishlist,
  onAdd,
  onOpen,
  quantityInCart = 0,
}: BookCardProps) {
  const stock = book.stock ?? 10;
  const stockLabel =
    stock === 0
      ? "Out of stock"
      : stock < 5
        ? `Low stock: ${stock} left`
        : `${stock} available`;
  return (
    <article className="book-card">
      <div
        className="book-card__visual"
        onClick={() => onOpen(book)}
        role="button"
        tabIndex={0}
        onKeyDown={event => event.key === "Enter" && onOpen(book)}
      >
        {book.badge && <span className="book-card__badge">{book.badge}</span>}
        <button
          className={`icon-button book-card__heart ${wished ? "is-wished" : ""}`}
          onClick={event => {
            event.stopPropagation();
            onWishlist(book);
          }}
          aria-label={
            wished
              ? `Remove ${book.title} from wishlist`
              : `Add ${book.title} to wishlist`
          }
        >
          <Heart size={17} fill={wished ? "currentColor" : "none"} />
        </button>
        <BookCover book={book} size="card" />
        <button
          className="book-card__quickview"
          onClick={event => {
            event.stopPropagation();
            onOpen(book);
          }}
        >
          Quick view
        </button>
      </div>
      <div className="book-card__content">
        <div className="book-card__meta">
          <span>{book.category}</span>
          <span className="rating">
            <Star size={12} fill="currentColor" /> {book.rating}
          </span>
        </div>
        <button className="book-card__title" onClick={() => onOpen(book)}>
          {book.title}
        </button>
        <p className="book-card__author">{book.author}</p>
        <p
          className={`book-stock${stock === 0 ? " is-out" : stock < 5 ? " is-low" : ""}`}
          aria-live="polite"
        >
          {stockLabel}
        </p>
        <div className="book-card__footer">
          <strong className="book-card__price">
            {formatPrice(book.price)}
          </strong>
          <button
            className="add-button"
            onClick={() => onAdd(book)}
            disabled={stock === 0 || quantityInCart >= stock}
          >
            <ShoppingCart size={15} />{" "}
            {stock === 0 ? "Out of stock" : "Add to cart"}
          </button>
        </div>
      </div>
    </article>
  );
}
