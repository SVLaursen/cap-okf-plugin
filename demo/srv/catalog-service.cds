using { demo.bookshop as shop } from '../db/schema';

/** Browse the catalog and place orders. */
service CatalogService @(path: '/odata/v4/catalog') {

  /** Books on sale, without internal purchase prices. */
  @readonly
  entity Books as projection on shop.Books excluding { costPrice, createdBy, modifiedBy }
    actions {
      /** Holds copies of this book for a shopper; returns the copies left. */
      action reserve(quantity : Integer) returns Integer;
      /** Tells whether this book can be delivered within the given number of days. */
      function availableWithin(days : Integer) returns Boolean;
    };

  @readonly
  entity Authors as projection on shop.Authors { ID, name, country, books };

  @readonly
  entity Genres as projection on shop.Genres;

  /** Finds books whose author's name contains the given text. */
  function booksByAuthor(name : String) returns many Books;

  /** Places an order for one book and returns its order number. */
  action submitOrder(book : Books:ID, quantity : Integer) returns {
    orderNo : String;
    total   : shop.Price;
  };

  /** Emitted after an order was placed. */
  event OrderSubmitted {
    orderNo  : String;
    book     : Books:ID;
    quantity : Integer;
  }
}
