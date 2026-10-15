import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  normalizeAddress,
  normalizeRates,
  safeTrackingUrl,
  ShipStation,
  ShippingProviderError,
  validatePackage,
} from "./shipstation";
import { downloadLabelPdf, formatLabelPdf, validateLabelUrl } from "./label-pdf";

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

test("a malformed rate cannot discard valid alternatives or produce an unusable price", () => {
  const valid = { rate_id: "se-valid", shipping_amount: { amount: 8, currency: "usd" }, carrier_code: "usps", service_code: "ground" };
  const output = normalizeRates([
    null, false, "unexpected",
    { ...valid, rate_id: "" },
    { ...valid, rate_id: "se-currency", shipping_amount: { amount: 5, currency: 42 } },
    { ...valid, rate_id: "se-invalid-charge", insurance_amount: false },
    { ...valid, rate_id: "se-overflow", shipping_amount: { amount: Number.MAX_VALUE, currency: "usd" }, other_amount: { amount: Number.MAX_VALUE, currency: "usd" } },
    valid,
  ]);
  assert.deepEqual(output.map(rate => rate.rateId), ["se-valid"]);
  assert.equal(output[0].amount, 8);
});

test("rate requests carry the reserved parcel and addresses without purchasing postage", async () => {
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
  const address = normalizeAddress({ name: "Test Customer", phone: "5555550100", address1: "1 Test St", city: "Carlsbad", state: "CA", zip: "92009" });
  const transport = (async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("API-Key"), "synthetic-key");
    return new Response(JSON.stringify(calls.length === 1
      ? { carriers: [{ carrier_id: "se-1" }, null, { carrier_id: "" }, { carrier_id: "se-2" }] }
      : { shipment_id: "se-shipment", rate_response: { rates: [{ rate_id: "se-rate", shipping_amount: { amount: 7.25, currency: "usd" } }] } }), { status: 200 });
  }) as typeof fetch;
  const result = await new ShipStation("synthetic-key", transport).rates({
    externalId: "local-reservation", orderNumber: "LCG-TEST", shipFrom: address, returnTo: address, shipTo: address,
    parcel: { weightLb: 2.5, lengthIn: 10, widthIn: 8, heightIn: 6 },
  });
  assert.deepEqual(calls.map(call => [call.method, call.url]), [["GET", "https://api.shipstation.com/v2/carriers"], ["POST", "https://api.shipstation.com/v2/rates"]]);
  assert.deepEqual(calls[1].body?.rate_options, { carrier_ids: ["se-1", "se-2"], preferred_currency: "usd" });
  const shipment = calls[1].body?.shipment as Record<string, unknown>;
  assert.equal(shipment.external_shipment_id, "local-reservation");
  assert.deepEqual(shipment.ship_to, address);
  assert.deepEqual(shipment.return_to, address);
  assert.deepEqual(shipment.packages, [{ package_code: "package", weight: { value: 2.5, unit: "pound" }, dimensions: { length: 10, width: 8, height: 6, unit: "inch" } }]);
  assert.equal(result.providerShipmentId, "se-shipment");
  assert.equal(result.rates[0].amount, 7.25);
});

test("provider failures remain sanitized and purchase requests are never automatically retried", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    let calls = 0;
    const provider = new ShipStation("secret-fixture-key", (async () => {
      calls++;
      return new Response(JSON.stringify({ message: "secret-fixture-key private customer address" }), { status });
    }) as typeof fetch);
    await assert.rejects(provider.buyLabel("se-rate", "local", "4x6"), error => {
      assert.ok(error instanceof ShippingProviderError);
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /secret-fixture|private customer/);
      return true;
    });
    assert.equal(calls, 1);
  }
  const interrupted = new ShipStation("secret-fixture-key", (async () => { throw new Error("private transport details"); }) as typeof fetch);
  await assert.rejects(interrupted.buyLabel("se-rate", "local", "4x6"), /Check shipment status/);
  await assert.rejects(interrupted.findLabel("local"), /Check shipment status/);
});

test("malformed successful provider responses fail before a label can be used", async () => {
  for (const body of ["not-json", "null", "42", '"unexpected"', "[]"]) {
    const provider = new ShipStation("synthetic-key", (async () => new Response(body, { status: 200 })) as typeof fetch);
    await assert.rejects(provider.getLabel("se-label"), /unreadable response/);
  }
});

test("no carrier connections stop rate creation before a POST", async () => {
  for (const carriers of [[], [null], [{ carrier_id: "" }]]) {
    let calls = 0;
    const provider = new ShipStation("synthetic-key", (async () => {
      calls++;
      return new Response(JSON.stringify({ carriers }), { status: 200 });
    }) as typeof fetch);
    const address = normalizeAddress({ name: "Test", phone: "5555550100", address1: "1 Test St", city: "Carlsbad", state: "CA", zip: "92009" });
    await assert.rejects(provider.rates({ externalId: "local", orderNumber: "LCG-TEST", shipFrom: address, returnTo: address, shipTo: address, parcel: { weightLb: 1, lengthIn: 1, widthIn: 1, heightIn: 1 } }), /Connect a carrier/);
    assert.equal(calls, 1);
  }
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
  source.addPage([288, 432]).drawText("Second test shipping label");
  const bytes = await source.save();
  const letter = await PDFDocument.load(await formatLabelPdf(bytes, "letter"));
  assert.equal(letter.getPageCount(), 2);
  for (const page of letter.getPages()) {
    assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  }
  assert.equal(await formatLabelPdf(bytes, "4x6"), bytes);
  for (const url of [
    "http://localhost/private",
    "http://api.shipstation.com/v2/downloads/a.pdf",
    "https://127.0.0.1/v2/downloads/a.pdf",
    "https://[::1]/v2/downloads/a.pdf",
    "https://api.shipstation.com.evil.test/v2/downloads/a.pdf",
    "https://api.shipstation.com@evil.test/v2/downloads/a.pdf",
    "https://user:password@api.shipstation.com/v2/downloads/a.pdf",
    "https://api.shipstation.com:8443/v2/downloads/a.pdf",
    "https://api.shipstation.com/v2/account/settings",
    "https://api.shipstation.com/v2/downloads/../account/settings",
    "https://api.shipstation.com/v2/downloads/%2e%2e/account/settings",
    "data:application/pdf;base64,JVBERi0=",
    "file:///C:/private.pdf",
  ]) {
    assert.throws(() => validateLabelUrl(url), url);
  }
  assert.equal(
    validateLabelUrl("https://api.shipstation.com/v2/downloads/label.pdf")
      .hostname,
    "api.shipstation.com",
  );
  assert.equal(
    validateLabelUrl("https://api.shipengine.com/v1/downloads/6/token/label-123.pdf").hostname,
    "api.shipengine.com",
  );
  assert.equal(safeTrackingUrl("other", "123"), null);
});

test("label downloads enforce the host allowlist, PDF content, and streaming size limit", async () => {
  let calls = 0;
  const valid = new TextEncoder().encode("%PDF-synthetic-label");
  const transport = (async (_url, init) => {
    calls++;
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).has("API-Key"), false);
    return new Response(valid);
  }) as typeof fetch;
  await assert.rejects(downloadLabelPdf("https://127.0.0.1/v2/downloads/label.pdf", transport), /unsupported label/);
  assert.equal(calls, 0);
  assert.deepEqual(await downloadLabelPdf("https://api.shipstation.com/v2/downloads/label.pdf", transport), valid);
  await assert.rejects(downloadLabelPdf("https://api.shipstation.com/v2/downloads/label.pdf", (async () => new Response("<html>upstream error</html>")) as typeof fetch), /not a PDF/);
  for (const response of [
    new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } }),
    new Response(null, { status: 200, headers: { "content-length": "10000001" } }),
  ]) {
    await assert.rejects(downloadLabelPdf("https://api.shipstation.com/v2/downloads/label.pdf", (async () => response) as typeof fetch), /could not be downloaded/);
  }
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(10_000_001)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(downloadLabelPdf("https://api.shipstation.com/v2/downloads/label.pdf", (async () => new Response(oversized)) as typeof fetch), /too large/);
  assert.equal(cancelled, true);
});
