import test from "node:test";
import assert from "node:assert/strict";
import { selectedShippingItems, shippingPackage, safeTrackingUrl } from "./shipping-input";
const items = [
  { orderItemId: "local", name: "Coffee", sku: "COF", orderedQuantity: 4, availableQuantity: 2, reservedQuantity: 1, shippedQuantity: 1 },
  { orderItemId: "supplier", name: "Chai", sku: "CHAI", orderedQuantity: 2, availableQuantity: 0, reservedQuantity: 0, shippedQuantity: 0 },
];
test("selection is limited to available whole quantities and known order items", () => {
  assert.deepEqual(selectedShippingItems(items, { local: "2", supplier: "0", foreign: "100" }), [{ orderItemId: "local", quantity: 2 }]);
  const invalid: Record<string, string>[] = [{}, { local: "0" }, { local: "3" }, { local: "1.5" }, { local: "-1" }, { local: "NaN" }, { supplier: "1" }];
  for (const quantities of invalid) {
    assert.throws(() => selectedShippingItems(items, quantities));
  }
});
test("package inputs require all dimensions and a finite positive weight", () => {
  const valid = { weightLb: "2.5", lengthIn: "12", widthIn: "8", heightIn: "6" };
  assert.deepEqual(shippingPackage(valid), { weightLb: 2.5, lengthIn: 12, widthIn: 8, heightIn: 6 });
  for (const weightLb of ["", "0", "-1", "Infinity", "NaN"]) assert.throws(() => shippingPackage({ ...valid, weightLb }));
});
test("tracking links reject scripts, insecure URLs and embedded credentials", () => {
  for (const url of [undefined, null, "", "javascript:alert(1)", "http://example.com", "https://user:secret@example.com", "broken"]) assert.equal(safeTrackingUrl(url), undefined);
  assert.equal(safeTrackingUrl("https://www.ups.com/track?tracknum=TEST"), "https://www.ups.com/track?tracknum=TEST");
});
