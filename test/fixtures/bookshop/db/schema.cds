namespace sample.bookshop;

using { cuid, managed } from '@sap/cds/common';

/** A book that the shop can sell. */
@title: '{i18n>Books}'
@description: '{i18n>BooksDescription}'
entity Books : cuid, managed {
  @title: '{i18n>Title}'
  title         : String(150) @mandatory;
  /** Short text shown on the book's detail page. */
  @title: '{i18n>Summary}'
  summary       : String(2000);
  @title: '{i18n>PublishedYear}'
  publishedYear : Integer;
  @title: '{i18n>Pages}'
  pages         : Integer;
  @title: '{i18n>Copies}'
  copies        : Integer default 0;
  @title: '{i18n>Author}'
  author        : Association to Authors;
  @title: '{i18n>Genre}'
  genre         : Association to Genres;
}

/** A person who wrote one or more books. */
@title: '{i18n>Authors}'
entity Authors : cuid, managed {
  @title: '{i18n>Name}'
  name    : String(150) @mandatory;
  @title: '{i18n>Country}'
  country : String(2);
  books   : Association to many Books on books.author = $self;
}

/** A category of books; genres can be nested. */
@title: '{i18n>Genres}'
entity Genres {
  key code     : String(20);
      @title: '{i18n>Name}'
      name     : String(100);
      parent   : Association to Genres;
      children : Composition of many Genres on children.parent = $self;
}
