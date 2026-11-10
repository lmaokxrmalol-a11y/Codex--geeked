import type { CSSProperties } from "react";
import type { Book } from "../data/books";

type BookCoverProps = {
  book: Book;
  size?: "hero" | "card" | "detail";
};

export default function BookCover({ book, size = "card" }: BookCoverProps) {
  const style = {
    "--cover-color": book.coverColor,
    "--cover-accent": book.coverAccent,
  } as CSSProperties;

  return (
    <div className={`book-cover book-cover--${size}`} style={style} aria-label={`${book.title} by ${book.author}`}>
      <div className="book-cover__grain" />
      <div className="book-cover__topline">
        <span>leaf &amp; lore</span>
        <span>{book.category}</span>
      </div>
      <div className="book-cover__title">{book.title}</div>
      <div className="book-cover__mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="book-cover__bottomline">
        <span>{book.coverLabel}</span>
        <strong>{book.author}</strong>
      </div>
    </div>
  );
}
