using { demo.bookshop as shop } from '../db/schema';

/** Maintenance of the catalog and orders by shop staff. */
service AdminService @(path: '/odata/v4/admin', requires: ['admin', 'support']) {

  @restrict: [
    { grant: 'READ', to: 'support' },
    { grant: '*', to: 'admin' }
  ]
  entity Books as projection on shop.Books;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity Authors as projection on shop.Authors;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity Genres as projection on shop.Genres;

  /** Orders placed in the shop. */
  @restrict: [
    { grant: 'READ', to: 'support', where: 'createdBy = $user' },
    { grant: '*', to: 'admin' }
  ]
  entity Orders as projection on shop.Orders;

  /** Raises the stock of a book. */
  @requires: 'admin'
  action restock(book : Books:ID, quantity : Integer) returns Integer;
}
