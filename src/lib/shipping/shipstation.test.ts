import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  normalizeAddress,
  normalizeRates,
  safeTrackingUrl,
  ShipStation,
  validatePackage,
} from "./shipstation";
import { formatLabelPdf, validateLabelUrl } from "./label-pdf";

test("domestic address and package validation reject incomplete/international/invalid input", () => {
  const address = {
    first_name: "Test",
    last_name: "Customer",
    address1: "1 Main St",
    city: "Carlsbad",
    state: "CA",
    zip: "92009",
    phone: "7605550100",
  };
  assert.equal(normalizeAddress(address).name, "Test Customer");
  assert.throws(() => normalizeAddress({ ...address, country: "CA" }));
  assert.throws(() => normalizeAddress({ ...address, address1: "" }));
  assert.throws(() =>
    validatePackage({ weightLb: 0, lengthIn: 1, widthIn: 1, heightIn: 1 }),
  );
  assert.throws(() =>
    validatePackage({ weightLb: 1, lengthIn: NaN, widthIn: 1, heightIn: 1 }),
  );
  assert.equal(
    validatePackage({ weightLb: 2, lengthIn: 10, widthIn: 6, heightIn: 4 })
      .weightLb,
    2,
  );
});
test("rates include all quoted charges and exclude invalid/foreign/malformed prices", () => {
  const rate = {
    rate_id: "se-123",
    shipping_amount: { amount: 5, currency: "usd" },
    other_amount: { amount: 1.5, currency: "usd" },
    tax_amount: { amount: 0.5, currency: "usd" },
    carrier_code: "ups",
    service_code: "ground",
  };
  assert.equal(normalizeRates([rate])[0].amount, 7);
  assert.equal(
    normalizeRates([
      { ...rate, validation_status: "invalid" },
      { ...rate, shipping_amount: { amount: 5, currency: "cad" } },
      { ...rate, rate_id: null },
    ]).length,
    0,
  );
});
test("purchase uses stable external shipment ID and recovery only reads; 404 is not authorization to rebuy", async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const transport = (async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(
      JSON.stringify({ label_id: "se-1", status: "completed" }),
      { status: 200 },
    );
  }) as typeof fetch;
  const provider = new ShipStation("test-key", transport);
  await provider.buyLabel("se-123", "local-unique", "4x6");
  await provider.findLabel("local-unique");
  await provider.getLabel("se-1");
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  assert.equal(
    (calls[0].body as Record<string, string>).external_shipment_id,
    "local-unique",
  );
  assert.match(calls[1].url, /external_shipment_id\/local-unique$/);
  const missing = new ShipStation(
    "test-key",
    (async () => new Response("{}", { status: 404 })) as typeof fetch,
  );
  assert.equal(await missing.findLabel("uncertain"), null);
});
test("letter printing preserves original label without purchasing and download URL rejects SSRF", async () => {
  const source = await PDFDocument.create();
  source.addPage([288, 432]).drawText("Test shipping label");
  const bytes = await source.save();
  const letter = await PDFDocument.load(await formatLabelPdf(bytes, "letter"));
  assert.deepEqual(letter.getPage(0).getSize(), { width: 612, height: 792 });
  assert.equal(await formatLabelPdf(bytes, "4x6"), bytes);
  assert.throws(() => validateLabelUrl("http://localhost/private"));
  assert.throws(() =>
    validateLabelUrl("https://api.shipstation.com.evil.test/v2/downloads/a"),
  );
  assert.throws(() =>
    validateLabelUrl("https://api.shipstation.com/v2/account/settings"),
  );
  assert.equal(
    validateLabelUrl("https://api.shipstation.com/v2/downloads/label.pdf")
      .hostname,
    "api.shipstation.com",
  );
  assert.equal(safeTrackingUrl("other", "123"), null);
});
