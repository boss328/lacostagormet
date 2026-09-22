import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productCategoryIds } from './product-categories';
test('editing a milk product preserves its second category with older clients', () => {
  assert.deepEqual(
    productCategoryIds('coffee', 'coffee', ['coffee', 'milks']),
    ['coffee', 'milks'],
  );
});
test('changing primary replaces only the old primary and keeps other assignments', () => {
  assert.deepEqual(productCategoryIds('tea', 'coffee', ['coffee', 'milks']), [
    'tea',
    'milks',
  ]);
});
test('explicit category choices can add, remove and deduplicate memberships', () => {
  assert.deepEqual(
    productCategoryIds(
      'milks',
      'coffee',
      ['coffee'],
      ['coffee', 'milks', 'coffee'],
    ),
    ['milks', 'coffee'],
  );
  assert.deepEqual(
    productCategoryIds('coffee', 'coffee', ['coffee', 'milks'], []),
    ['coffee'],
  );
});
