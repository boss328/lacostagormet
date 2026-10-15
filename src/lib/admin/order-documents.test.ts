import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPackingLines, invoiceTotals, addressLines, documentPaymentStatus } from './order-documents';

const lines = [
  { id: 'line-1', product_sku: 'OAT', product_name: 'Oat milk', quantity: 4, unit_price: '12.50', line_subtotal: '50.00', assigned_vendor_id: 'private-vendor' },
  { id: 'line-2', product_sku: 'CHAI', product_name: 'Chai', quantity: 2, unit_price: '20.00', line_subtotal: '40.00', assigned_vendor_id: null },
];

test('packing slip defaults to whole order without prices or supplier data', () => {
  const result = selectPackingLines(lines, undefined);
  assert.equal(result.error, null);
  assert.deepEqual(result.lines[0], { id: 'line-1', product_sku: 'OAT', product_name: 'Oat milk', quantity: 4 });
  assert.equal(result.lines.length, 2);
});

test('partial packing slip uses selected quantities and preserves order line sequence', () => {
  const result = selectPackingLines(lines, JSON.stringify([{ id: 'line-2', quantity: 1 }, { id: 'line-1', quantity: 2 }]));
  assert.equal(result.error, null);
  assert.deepEqual(result.lines.map(({ id, quantity }) => ({ id, quantity })), [{ id: 'line-1', quantity: 2 }, { id: 'line-2', quantity: 1 }]);
  assert.equal(lines[0].quantity, 4);
});

test('rejects unknown lines, excessive, fractional, empty, repeated, and malformed selections', () => {
  const invalid: unknown[] = [
    [], [{ id: 'another-order-line', quantity: 1 }], [{ id: 'line-1', quantity: 5 }],
    [{ id: 'line-1', quantity: 0 }], [{ id: 'line-1', quantity: -1 }], [{ id: 'line-1', quantity: 1.5 }],
    [{ id: 'line-1', quantity: '2' }], [{ id: 'line-1', quantity: 2 }, { id: 'line-1', quantity: 2 }],
    null, {}, [null],
  ];
  for (const value of invalid) {
    const result = selectPackingLines(lines, JSON.stringify(value));
    assert.ok(result.error, JSON.stringify(value));
    assert.deepEqual(result.lines, []);
  }
  for (const value of ['', '{bad', 'x'.repeat(20_001), ['[]', '[]']]) assert.ok(selectPackingLines(lines, value).error);
});

test('invoice totals print saved amounts including discount without recalculating order total', () => {
  assert.deepEqual(invoiceTotals({ subtotal: '90.00', discount: '5.00', shipping_cost: '7.50', tax: '6.19', total: '98.68' }), [
    { label: 'Subtotal', value: '$90.00' }, { label: 'Discount', value: '-$5.00' },
    { label: 'Shipping', value: '$7.50' }, { label: 'Tax', value: '$6.19' }, { label: 'Order total (USD)', value: '$98.68' },
  ]);
});

test('zero discount is omitted and malformed recorded amounts fail instead of printing zero', () => {
  const totals = { subtotal: 0, discount: 0, shipping_cost: 0, tax: 0, total: 0 };
  assert.equal(invoiceTotals(totals).length, 4);
  assert.throws(() => invoiceTotals({ ...totals, total: 'broken' }));
});

test('addresses include company, unit, postal code, and country but exclude internal fields', () => {
  assert.deepEqual(addressLines({ company: 'Coffee House', first_name: 'Jeff', last_name: 'Example', address1: '1 Main St', address2: 'Suite 2', city: 'Carlsbad', state: 'CA', zip: '92009', country: 'US', phone: 'private' }), ['Coffee House', 'Jeff Example', '1 Main St', 'Suite 2', 'Carlsbad, CA 92009', 'US']);
  assert.deepEqual(addressLines(null), []);
  assert.equal(documentPaymentStatus('payment_held'), 'Payment under review');
  assert.equal(documentPaymentStatus('partially_refunded'), 'Partially refunded');
});
