import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { NextRequest } from "next/server";
import * as providerHelpers from "../src/lib/shipping/shipstation";
import { renderLocalShipment } from "../src/lib/email/templates/local-shipment";

// Execute the real route with explicit boundary doubles. No network, credentials,
// service-role client, customer email or postage can be reached by this harness.
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../src/app/api/admin/orders/[orderNumber]/shipping/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const orderId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const shipmentId = "33333333-3333-4333-8333-333333333333";
const origin = "https://store.test";
const address = { first_name: "Test", last_name: "Buyer", phone: "5555550100", address1: "1 Test St", city: "Test", state: "CA", zip: "90001", country: "US" };

// Run the real supplier transition routes and access guard against an atomic
// update double. Filters are evaluated at execution time, as PostgreSQL does,
// including when another request has changed the PO since this page was opened.
function supplierTransitionHarness(action: "cancel" | "mark-acknowledged", initialStatus: string) {
  const poId = "44444444-4444-4444-8444-444444444444";
  const state = {
    status: initialStatus,
    emailSendStartedAt: null as string | null,
    changeBeforeUpdate: null as string | null,
    preview: false,
    storageFailure: false,
    clientCalls: 0,
    writes: 0,
  };
  function execute(file: string, modules: Record<string, unknown>) {
    const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const evaluated = { exports: {} as { POST: (req: NextRequest, context: { params: { id: string } }) => Promise<Response> } };
    new Function("require", "module", "exports", source)((name: string) => {
      if (!(name in modules)) throw new Error(`Unmocked supplier boundary: ${name}`);
      return modules[name];
    }, evaluated, evaluated.exports);
    return evaluated.exports;
  }
  const guard = execute("../src/lib/admin/shipping-access.ts", {
    "server-only": {},
    "next/server": require("next/server"),
    "./session": { ADMIN_COOKIE: "test-admin", expectedSessionToken: async () => "valid-token" },
    "@/lib/preview-mode": { isReadOnlyPreview: () => state.preview },
  });
  const route = execute(`../src/app/api/admin/purchase-orders/[id]/${action}/route.ts`, {
    "server-only": {},
    "next/server": require("next/server"),
    "@/lib/admin/shipping-access": guard,
    "@/lib/supabase/admin": {
      createAdminClient() {
        state.clientCalls++;
        return {
          from(table: string) {
            assert.equal(table, "vendor_orders");
            let update: { status: string };
            const filters = new Map<string, string | null>();
            type Builder = {
              update: (value: { status: string }) => Builder;
              eq: (column: string, value: string) => Builder;
              is: (column: string, value: null) => Builder;
              select: (columns: string) => Builder;
              maybeSingle: () => Builder;
              then: (resolve: (value: unknown) => void) => void;
            };
            const builder: Builder = {
              update(value: { status: string }) { update = value; return builder; },
              eq(column: string, value: string) { filters.set(column, value); return builder; },
              is(column: string, value: null) { filters.set(column, value); return builder; },
              select(columns: string) { assert.equal(columns, "id"); return builder; },
              maybeSingle() { return builder; },
              then(resolve: (value: unknown) => void) {
                if (state.changeBeforeUpdate) state.status = state.changeBeforeUpdate;
                if (state.storageFailure) return resolve({ data: null, error: { message: "Storage unavailable" } });
                const matches = filters.get("id") === poId && (!filters.has("status") || filters.get("status") === state.status) && (!filters.has("email_send_started_at") || filters.get("email_send_started_at") === state.emailSendStartedAt);
                if (matches) { state.status = update.status; state.writes++; }
                resolve({ data: matches ? { id: poId } : null, error: null });
              },
            };
            return builder;
          },
        };
      },
    },
  });
  function request(options: { auth?: boolean; origin?: string | null } = {}) {
    const headers: Record<string, string> = {};
    if (options.auth !== false) headers.cookie = "test-admin=valid-token";
    if (options.origin !== null) headers.origin = options.origin ?? origin;
    return route.POST(new NextRequest(`${origin}/api/admin/purchase-orders/${poId}/${action}/`, { method: "POST", headers }), { params: { id: poId } });
  }
  return { state, request };
}

test("supplier cancellation and acknowledgment allow only their current permitted state", async () => {
  for (const [action, permitted, target] of [["cancel", "pending", "cancelled"], ["mark-acknowledged", "sent", "confirmed"]] as const) {
    for (const current of ["pending", "sent", "confirmed", "shipped", "delivered", "cancelled"]) {
      const h = supplierTransitionHarness(action, current);
      const response = await h.request();
      assert.equal(response.status, current === permitted ? 200 : 409, `${action} from ${current}`);
      assert.equal(h.state.status, current === permitted ? target : current);
      assert.equal(h.state.writes, current === permitted ? 1 : 0);
      if (current === permitted) {
        assert.equal((await h.request()).status, 409, "a repeated stale request must not rewrite the PO");
        assert.equal(h.state.writes, 1);
      }
    }
  }
});

test("supplier transition predicates protect a PO changed before the update executes", async () => {
  for (const [action, initial] of [["cancel", "pending"], ["mark-acknowledged", "sent"]] as const) {
    for (const changed of ["shipped", "delivered", "cancelled"]) {
      const h = supplierTransitionHarness(action, initial);
      h.state.changeBeforeUpdate = changed;
      assert.equal((await h.request()).status, 409);
      assert.equal(h.state.status, changed);
      assert.equal(h.state.writes, 0);
    }
  }
});

test("supplier transitions reject anonymous, cross-origin, and preview requests before storage", async () => {
  for (const action of ["cancel", "mark-acknowledged"] as const) {
    for (const scenario of ["anonymous", "cross-origin", "missing-origin", "preview"] as const) {
      const h = supplierTransitionHarness(action, action === "cancel" ? "pending" : "sent");
      h.state.preview = scenario === "preview";
      const response = await h.request({ auth: scenario !== "anonymous", origin: scenario === "cross-origin" ? "https://other.test" : scenario === "missing-origin" ? null : origin });
      assert.equal(response.status, scenario === "anonymous" ? 401 : scenario === "preview" ? 409 : 403);
      assert.equal(h.state.clientCalls, 0);
      assert.equal(h.state.writes, 0);
    }
    const h = supplierTransitionHarness(action, action === "cancel" ? "pending" : "sent");
    h.state.storageFailure = true;
    assert.equal((await h.request()).status, 500);
    assert.equal(h.state.writes, 0);
  }
});

function harness() {
  const mutations: Array<{ action: string; payload: any }> = [];
  const calls: string[] = [];
  const emails: any[] = [];
  const state = {
    config: { enabled: true, ready: true, canRecordManual: true, canQuote: true, canPurchase: true, apiKey: "test-key-never-disclosed", shipFrom: { ...address }, returnTo: { ...address } },
    order: { id: orderId, order_number: "TEST-100", status: "paid", fulfillment_status: "unfulfilled", customer_email: "buyer@example.test", shipping_address: { ...address } },
    items: [{ id: itemId, product_name: "Coffee <script>alert(1)</script>", product_sku: "COFFEE", quantity: 3, assigned_vendor_id: null }],
    pos: [] as any[],
    shipments: [] as any[],
    shipment: { id: shipmentId, external_id: shipmentId, status: "draft", rates: [{ rateId: "se-rate", carrier: "USPS", service: "Ground", amount: 8.45, currency: "USD" }], carrier: "USPS", label_id: "se-label", label_download_url: "https://api.shipstation.com/v2/downloads/test.pdf", tracking_number: "TRACK123", tracking_url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=TRACK123", local_shipment_items: [{ order_item_id: itemId, quantity: 2 }] },
    label: { status: "completed", label_id: "se-label", external_shipment_id: shipmentId, tracking_number: "TRACK123", carrier_code: "usps", label_download: { pdf: "https://api.shipstation.com/v2/downloads/test.pdf" } } as any,
    providerFailure: "",
    mutationFailure: "",
    schemaFailure: false,
    claimPurchase: true,
    claimNotification: true,
    emailOk: true,
  };
  const db = {
    from(table: string) {
      const builder: any = {};
      for (const method of ["select", "eq", "neq", "order"]) builder[method] = () => builder;
      builder.then = (resolve: (v: unknown) => void) => {
        const data = table === "order_items" ? state.items : table === "vendor_orders" ? state.pos : table === "local_shipments" ? state.shipments : null;
        if (data === null) throw new Error(`Unexpected database table: ${table}`);
        resolve({ data, error: state.schemaFailure ? { message: "test unavailable" } : null });
      };
      return builder;
    },
  };
  class Provider {
    async rates() { calls.push("rates"); if (state.providerFailure) throw new Error(state.providerFailure); return { providerShipmentId: "se-shipment", rates: [{ rateId: "se-rate", carrier: "USPS", service: "Ground", amount: 8.45, currency: "USD" }] }; }
    async buyLabel() { calls.push("buy"); if (state.providerFailure) throw new Error(state.providerFailure); return state.label; }
    async findLabel() { calls.push("recover"); return state.label; }
    async getLabel() { calls.push("read-label"); return state.label; }
  }
  const modules: Record<string, unknown> = {
    "server-only": {},
    "next/server": require("next/server"),
    "@/lib/admin/session": { ADMIN_COOKIE: "test-admin", expectedSessionToken: async () => "valid-token" },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/shipping/config": { shippingConfiguration: () => state.config },
    "@/lib/shipping/repository": {
      shippingOrder: async () => { calls.push("order"); return state.order; },
      findShipment: async (requestedOrder: string, requestedShipment: string) => {
        assert.equal(requestedOrder, orderId);
        if (requestedShipment !== shipmentId) throw new Error("Shipment not found.");
        return state.shipment;
      },
      shippingMutation: async (requestedOrder: string, action: string, payload: any) => {
        assert.equal(requestedOrder, orderId);
        mutations.push({ action, payload });
        if (action === state.mutationFailure) throw new Error("Simulated storage failure.");
        if (action === "claim_purchase") return { claimed: state.claimPurchase };
        if (action === "claim_notification") return { claimed: state.claimNotification, notification_state: "sent" };
        return state.shipment;
      },
    },
    "@/lib/shipping/shipstation": { ...providerHelpers, ShipStation: Provider },
    "@/lib/shipping/label-pdf": {
      downloadLabelPdf: async () => { calls.push("download"); return Buffer.from("%PDF-test"); },
      formatLabelPdf: async (bytes: Uint8Array, format: string) => { calls.push(`format:${format}`); return bytes; },
    },
    "@/lib/email/send": { sendTransactionalEmail: async (input: any) => { emails.push(input); return { ok: state.emailOk }; } },
    "@/lib/email/templates/local-shipment": { renderLocalShipment },
  };
  const module = { exports: {} as any };
  new Function("require", "module", "exports", compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unmocked boundary: ${name}`);
    return modules[name];
  }, module, module.exports);
  async function request(method = "POST", body: unknown = { action: "recover", shipmentId }, options: { auth?: boolean; origin?: string | null; raw?: string; length?: string; query?: string } = {}) {
    const headers: Record<string, string> = {};
    if (options.auth !== false) headers.cookie = "test-admin=valid-token";
    if (options.origin !== null) headers.origin = options.origin ?? origin;
    if (options.length) headers["content-length"] = options.length;
    const req = new NextRequest(`${origin}/api/admin/orders/TEST-100/shipping/${options.query ?? ""}`, { method, headers, ...(method === "GET" ? {} : { body: options.raw ?? JSON.stringify(body) }) });
    return module.exports[method](req, { params: { orderNumber: "TEST-100" } });
  }
  return { state, calls, mutations, emails, request };
}
test("anonymous requests, cross-origin writes and disabled environments stop before storage", async () => {
  for (const method of ["GET", "POST"]) {
    const h = harness(); assert.equal((await h.request(method, {}, { auth: false })).status, 401); assert.deepEqual(h.calls, []);
  }
  for (const origin of [null, "https://attacker.test"]) {
    const h = harness(); assert.equal((await h.request("POST", {}, { origin })).status, 403); assert.deepEqual(h.calls, []);
  }
  const h = harness(); h.state.config.canRecordManual = false;
  assert.equal((await h.request()).status, 409); assert.deepEqual(h.calls, []);
});
test("JSON shape, malformed items and actual byte limits reject without mutation", async () => {
  for (const raw of ["null", "[]", "3", "broken", JSON.stringify({ action: "manual_tracking", items: [null] })]) {
    const h = harness(); const res = await h.request("POST", {}, { raw });
    assert.equal(res.status, 400); assert.doesNotMatch((await res.json()).error, /Cannot read|Unexpected token/); assert.equal(h.mutations.length, 0);
  }
  for (const options of [{ raw: JSON.stringify({ padding: "x".repeat(30_000) }) }, { length: "30001" }, { raw: JSON.stringify({ padding: "☕".repeat(10_001) }) }]) {
    const h = harness(); assert.equal((await h.request("POST", {}, options)).status, 413); assert.equal(h.mutations.length, 0);
  }
});
test("overview accounts for reserved and shipped quantities without exposing credentials", async () => {
  const h = harness();
  h.state.shipments = [{ ...h.state.shipment, status: "shipped", postage: "8.45", local_shipment_items: [{ order_item_id: itemId, quantity: 1 }] }, { ...h.state.shipment, status: "draft", postage: null, local_shipment_items: [{ order_item_id: itemId, quantity: 1 }] }];
  const res = await h.request("GET"); const data = await res.json();
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(data.items[0].availableQuantity, 1); assert.equal(data.items[0].shippedQuantity, 1); assert.equal(data.items[0].reservedQuantity, 1);
  assert.doesNotMatch(JSON.stringify(data), /test-key|shipFrom|customer_email/);
});
test("missing storage and supplier overlap disable applicable actions", async () => {
  const h = harness(); h.state.schemaFailure = true;
  const unavailable = await (await h.request("GET")).json(); assert.equal(unavailable.configuration.canRecordManual, false); assert.equal(unavailable.configuration.canPurchase, false);
  h.state.schemaFailure = false; h.state.pos = [{ vendor_id: "vendor", status: "sent" }];
  const blocked = await (await h.request("GET")).json(); assert.equal(blocked.items[0].availableQuantity, 0); assert.match(blocked.items[0].blockedReason, /vendor assignment/);
});
test("failed rates retain a failed draft; successful rates save server-owned quote", async () => {
  for (const failed of [false, true]) {
    const h = harness(); if (failed) h.state.providerFailure = "No usable rates.";
    const res = await h.request("POST", { action: "rates", items: [{ orderItemId: itemId, quantity: 2 }], package: { weightLb: 2, lengthIn: 5, widthIn: 5, heightIn: 5 } });
    assert.equal(res.status, failed ? 400 : 200);
    assert.deepEqual(h.mutations.map(m => m.action), ["reserve", failed ? "rate_failed" : "save_rates"]);
    assert.equal(h.emails.length, 0);
  }
});
test("invalid address or package never reserves stock or requests rates", async () => {
  for (const kind of ["country", "phone", "package"]) {
    const h = harness(); if (kind === "country") h.state.order.shipping_address.country = "CA";
    if (kind === "phone") h.state.order.shipping_address.phone = "";
    const res = await h.request("POST", { action: "rates", items: [{ orderItemId: itemId, quantity: 1 }], package: { weightLb: kind === "package" ? 151 : 2, lengthIn: 5, widthIn: 5, heightIn: 5 } });
    assert.equal(res.status, 400); assert.equal(h.mutations.length, 0); assert.ok(!h.calls.includes("rates"));
    h.state.order.shipping_address.country = "US"; h.state.order.shipping_address.phone = "5555550100";
  }
});
test("purchase gate and duplicate claim never call the provider", async () => {
  for (const gate of ["disabled", "claimed"]) {
    const h = harness(); if (gate === "disabled") h.state.config.canPurchase = false; else h.state.claimPurchase = false;
    assert.ok((await h.request("POST", { action: "buy_label", shipmentId, rateId: "se-rate" })).status >= 400);
    assert.ok(!h.calls.includes("buy")); assert.equal(h.emails.length, 0);
  }
});
test("previously saved restricted rates cannot be purchased or claim a shipment", async () => {
  for (const service of ["USPS Media Mail", "usps_library_mail", "Bound Printed Matter"]) {
    const h = harness(); h.state.shipment.rates[0].service = service;
    const res = await h.request("POST", { action: "buy_label", shipmentId, rateId: "se-rate" });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /cannot ship La Costa merchandise/);
    assert.deepEqual(h.mutations, []); assert.ok(!h.calls.includes("buy")); assert.equal(h.emails.length, 0);
  }
});

test("network or storage failure after a purchase leaves status unknown and never repurchases", async () => {
  for (const failure of ["provider", "storage"]) {
    const h = harness(); if (failure === "provider") h.state.providerFailure = "Timeout"; else h.state.mutationFailure = "store_label";
    assert.equal((await h.request("POST", { action: "buy_label", shipmentId, rateId: "se-rate" })).status, 400);
    assert.equal(h.calls.filter(c => c === "buy").length, 1);
    assert.equal(h.mutations.at(-1)?.action, "purchase_unknown"); assert.equal(h.emails.length, 0);
  }
});
test("recovery checks external reference, handles absent labels, and never buys", async () => {
  for (const scenario of ["missing", "mismatched", "completed"]) {
    const h = harness(); h.state.shipment.status = "unknown";
    if (scenario === "missing") h.state.label = null;
    if (scenario === "mismatched") h.state.label.external_shipment_id = orderId;
    const res = await h.request(); assert.equal(res.status, scenario === "mismatched" ? 400 : 200);
    assert.equal(h.mutations.some(m => m.action === "store_label"), scenario === "completed");
    assert.ok(!h.calls.includes("buy"));
  }
});
test("voided labels cannot print or dispatch; both print sizes are read-only", async () => {
  const h = harness(); h.state.shipment.status = "label_created"; h.state.label.status = "voided";
  assert.equal((await h.request("GET", null, { query: `?label=${shipmentId}` })).status, 409);
  assert.equal((await h.request("POST", { action: "mark_shipped", shipmentId })).status, 400); assert.equal(h.mutations.length, 0);
  h.state.label.status = "completed";
  h.state.label.voided = true;
  assert.equal((await h.request("GET", null, { query: `?label=${shipmentId}` })).status, 409);
  assert.equal((await h.request("POST", { action: "mark_shipped", shipmentId })).status, 400);
  h.state.label.voided = false;
  for (const format of ["4x6", "letter"]) {
    const res = await h.request("GET", null, { query: `?label=${shipmentId}&format=${format}` });
    assert.equal(res.status, 200); assert.equal(res.headers.get("content-type"), "application/pdf"); assert.ok(h.calls.includes(`format:${format}`));
  }
  assert.ok(!h.calls.includes("buy")); assert.equal(h.mutations.length, 0);
});
test("manual dispatch saves first and reports email failures with stable escaped notification", async () => {
  const h = harness(); h.state.emailOk = false;
  const res = await h.request("POST", { action: "manual_tracking", items: [{ orderItemId: itemId, quantity: 2 }], carrier: "USPS", trackingNumber: "TRACK123" });
  assert.equal(res.status, 200); assert.match((await res.json()).warning, /notification/);
  assert.deepEqual(h.mutations.map(m => m.action), ["manual", "claim_notification", "finish_notification"]);
  assert.equal(h.mutations.at(-1)?.payload.ok, false);
  assert.equal(h.emails[0].idempotencyKey, `local-shipment/${shipmentId}`);
  assert.match(h.emails[0].html, /&lt;script&gt;/); assert.doesNotMatch(h.emails[0].html, /<script>/);
  assert.ok(!h.calls.includes("buy"));
});
test("already-notified shipments do not send duplicate customer emails", async () => {
  const h = harness(); h.state.claimNotification = false;
  assert.equal((await h.request("POST", { action: "retry_notification", shipmentId })).status, 200);
  assert.equal(h.emails.length, 0); assert.deepEqual(h.mutations.map(m => m.action), ["claim_notification"]);
});
test("successful purchase stores the label without dispatching or notifying", async () => {
  const h = harness();
  const res = await h.request("POST", { action: "buy_label", shipmentId, rateId: "se-rate" });
  assert.equal(res.status, 200);
  assert.deepEqual(h.mutations.map(m => m.action), ["claim_purchase", "store_label"]);
  assert.equal(h.mutations[1].payload.label_id, "se-label");
  assert.equal(h.mutations[1].payload.tracking_number, "TRACK123");
  assert.equal(h.calls.filter(c => c === "buy").length, 1);
  assert.equal(h.emails.length, 0);
});
test("dispatch verifies the label before saving and claiming the notification", async () => {
  const h = harness(); h.state.shipment.status = "label_created";
  const res = await h.request("POST", { action: "mark_shipped", shipmentId });
  assert.equal(res.status, 200);
  assert.deepEqual(h.calls, ["order", "read-label"]);
  assert.deepEqual(h.mutations.map(m => m.action), ["mark_shipped", "claim_notification", "finish_notification"]);
  assert.equal(h.mutations.at(-1)?.payload.ok, true);
  assert.equal(h.emails.length, 1);
  const failed = harness(); failed.state.mutationFailure = "mark_shipped";
  assert.equal((await failed.request("POST", { action: "mark_shipped", shipmentId })).status, 400);
  assert.deepEqual(failed.mutations.map(m => m.action), ["mark_shipped"]);
  assert.equal(failed.emails.length, 0);
});
test("recovery never stores a completed label that is explicitly voided", async () => {
  const h = harness(); h.state.shipment.status = "unknown"; h.state.label.voided = true;
  assert.equal((await h.request()).status, 400);
  assert.equal(h.mutations.length, 0); assert.equal(h.emails.length, 0);
  assert.ok(!h.calls.includes("buy"));
});
