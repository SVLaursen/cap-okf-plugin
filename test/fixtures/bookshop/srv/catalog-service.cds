using { sample.bookshop as shop } from '../db/schema';

/** Read-only catalog for shoppers. */
service CatalogService @(path: '/catalog') {

  @readonly
  entity Books as projection on shop.Books {
    ID, title, summary, publishedYear, pages, copies, author, genre
  } actions {
    /** Holds copies of this book for a shopper; returns the copies left. */
    action reserve(copies: Integer) returns Integer;
  };

  @readonly
  entity Authors as projection on shop.Authors { ID, name, country, books };

  @readonly
  entity Genres as projection on shop.Genres;

  /** Emitted after copies of a book were reserved. */
  event BookReserved {
    book   : UUID;
    copies : Integer;
  }
}
