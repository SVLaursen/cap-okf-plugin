using { sample.bookshop as shop } from '../db/schema';

/** Maintenance of the catalog by shop staff. */
service AdminService @(path: '/admin', requires: 'authenticated-user') {

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'catalog-manager' }
  ]
  entity Books as projection on shop.Books;

  @restrict: [{ grant: '*', to: 'catalog-manager' }]
  entity Authors as projection on shop.Authors;

  @restrict: [{ grant: '*', to: 'catalog-manager' }]
  entity Genres as projection on shop.Genres;
}
