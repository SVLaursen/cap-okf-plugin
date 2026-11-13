namespace demo.bookshop;

using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';

/** Money amount in the shop's currency. */
type Price : Decimal(9, 2);

/** Where a book is in its life cycle. */
type BookStatus : String(20) enum {
  available;
  preorder;
  outOfPrint;
}

/** Reader ratings, shared by everything that can be reviewed. */
aspect Reviewed {
  @title: '{i18n>Rating}'
  rating      : Decimal(2, 1);
  @title: '{i18n>ReviewCount}'
  reviewCount : Integer default 0;
}

/** A book that the shop can sell. */
@title      : '{i18n>Books}'
@description: '{i18n>BooksDescription}'
@okf.tags   : ['catalog', 'sales']
entity Books : cuid, managed, Reviewed {
  @title: '{i18n>Title}'
  title     : String(150) @mandatory;
  /** Short text shown on the book's detail page. */
  @title: '{i18n>Summary}'
  summary   : String(2000);
  @title: '{i18n>Status}'
  status    : BookStatus default 'available';
  @title: '{i18n>Price}'
  price     : Price;
  /**
   * Purchase price; internal. CatalogService leaves it out, but AdminService
   * exposes it, so only @okf: false keeps it out of the bundle.
   */
  @okf: false
  costPrice : Price;
  @title: '{i18n>Stock}'
  stock     : Integer default 0;
  author    : Association to Authors;
  genre     : Association to Genres;
}

/** A person who wrote one or more books. */
@title: '{i18n>Authors}'
entity Authors : cuid, managed {
  @title: '{i18n>Name}'
  name    : String(150) @mandatory;
  /** Two-letter ISO country code. */
  country : String(2);
  books   : Association to many Books on books.author = $self;
}

/** A category of books; genres can be nested. */
@title: '{i18n>Genres}'
entity Genres : CodeList {
  key code     : String(20);
      parent   : Association to Genres;
      children : Composition of many Genres on children.parent = $self;
}

/** A customer's order with one or more items. */
@title: '{i18n>Orders}'
entity Orders : cuid, managed {
  orderNo : String(20);
  items   : Composition of many OrderItems on items.order = $self;
  total   : Price;
}

/** One book in an order. */
entity OrderItems : cuid {
  order    : Association to Orders;
  book     : Association to Books;
  quantity : Integer;
  price    : Price;
}

/**
 * Notes by shop staff. Not exposed by any service and excluded from the
 * bundle with @okf: false, so it must never show up in OKF output.
 */
@okf: false
entity InternalNotes : cuid, managed {
  book : Association to Books;
  text : String(1000);
}
