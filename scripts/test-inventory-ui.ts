import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
type Element = { type: unknown; props: Record<string, any> };
type Hook = { value?: any; deps?: unknown[] };
const productId = '11111111-1111-4111-8111-111111111111';
const product = { id: productId, sku: 'TS14-1', name: 'Tiger canister', stock_status: 'in_stock', weight_lb: 1, preferred_vendor_id: 'vendor' };

function nodes(root: any): Element[] {
  if (!root || typeof root !== 'object') return [];
  if (Array.isArray(root)) return root.flatMap(nodes);
  return [root, ...nodes(root.props?.children)];
}

function harness(initial: { on_hand: number; reserved: number; low_stock_threshold: number } | null) {
  const hooks: Hook[] = [];
  let index = 0;
  const effects: Array<() => void> = [];
  const fetches: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const events: unknown[] = [];
  let inventory = initial;
  let failPost = false;
  let failGet = false;
  let refreshes = 0;
  const react = {
    useState(value: any) {
      const slot = index++;
      if (!(slot in hooks)) hooks[slot] = { value };
      return [hooks[slot].value, (next: any) => { hooks[slot].value = typeof next === 'function' ? next(hooks[slot].value) : next; }];
    },
    useRef(value: any) {
      const slot = index++;
      if (!(slot in hooks)) hooks[slot] = { value: { current: value } };
      return hooks[slot].value;
    },
    useCallback(callback: unknown, deps: unknown[]) {
      const slot = index++;
      if (!(slot in hooks) || deps.some((dep, i) => dep !== hooks[slot].deps?.[i])) hooks[slot] = { value: callback, deps };
      return hooks[slot].value;
    },
    useEffect(callback: () => void, deps: unknown[]) {
      const slot = index++;
      if (!(slot in hooks) || deps.some((dep, i) => dep !== hooks[slot].deps?.[i])) effects.push(callback);
      hooks[slot] = { deps };
    },
  };
  const fetch = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    fetches.push({ url, method, body });
    if (method === 'GET') {
      if (failGet) throw new Error('Stock refresh interrupted');
      return { ok: true, status: 200, json: async () => ({ ok: true, product, inventory, movements: [], vendors: [] }) };
    }
    if (method === 'POST') {
      if (failPost) throw new Error('Connection lost after sending');
      inventory = { on_hand: 12, reserved: 2, low_stock_threshold: 5 };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/components/admin/ProductInventory.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const target = { exports: {} as { ProductInventory?: (props: { productId: string; sku: string }) => Element } };
  const modules: Record<string, unknown> = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useRouter: () => ({ refresh: () => { refreshes++; } }) },
  };
  new Function('require', 'module', 'exports', 'fetch', 'window', compiled)((name: string) => {
    assert.ok(name in modules, `Unexpected UI boundary ${name}`);
    return modules[name];
  }, target, target.exports, fetch, { dispatchEvent: (event: unknown) => events.push(event) });
  const render = () => { index = 0; return target.exports.ProductInventory!({ productId, sku: product.sku }); };
  let tree = render();
  return {
    fetches, events,
    set failPost(value: boolean) { failPost = value; },
    set failGet(value: boolean) { failGet = value; },
    get refreshes() { return refreshes; },
    render() { tree = render(); return tree; },
    async mount() { for (const effect of effects.splice(0)) effect(); await new Promise(resolve => setImmediate(resolve)); tree = render(); },
    change(id: string, value: string) { nodes(tree).find(node => node.props?.id === id)!.props.onChange({ target: { value } }); tree = render(); },
    async adjust() { const form = nodes(tree).filter(node => node.type === 'form').at(-1)!; await form.props.onSubmit({ preventDefault() {} }); tree = render(); },
    nodes() { return nodes(tree); },
  };
}

test('stock adjustment targets one SKU and retries an uncertain write with the same operation ID', async () => {
  const h = harness({ on_hand: 10, reserved: 2, low_stock_threshold: 5 });
  await h.mount();
  h.change('inventory-quantity', '2');
  h.change('inventory-reason', 'Delivery received');
  h.failPost = true;
  await h.adjust();
  assert.equal(h.fetches.filter(item => item.method === 'POST').length, 1);
  assert.ok(h.nodes().filter(node => node.type === 'fieldset').every(node => node.props.disabled));
  h.failPost = false;
  await h.adjust();
  const posts = h.fetches.filter(item => item.method === 'POST');
  assert.deepEqual(posts[1], posts[0]);
  assert.equal(posts[0].url, `/api/admin/products/${productId}/inventory/`);
  assert.deepEqual({ ...posts[0].body, requestId: 'id' }, { action: 'add', quantity: 2, reason: 'Delivery received', requestId: 'id' });
  assert.match(posts[0].body!.requestId as string, /^[a-f0-9-]{36}$/);
  assert.equal(h.refreshes, 1);
});

test('opening count may be zero but empty, fractional and negative counts do not submit', async () => {
  const h = harness(null);
  await h.mount();
  h.change('inventory-reason', 'Opening physical count');
  for (const value of ['', '1.5', '-1']) {
    h.change('inventory-quantity', value);
    await h.adjust();
  }
  assert.equal(h.fetches.filter(item => item.method === 'POST').length, 0);
  h.change('inventory-quantity', '0');
  h.change('inventory-reason', ' x ');
  await h.adjust();
  assert.equal(h.fetches.filter(item => item.method === 'POST').length, 0);
  h.change('inventory-reason', 'Opening physical count');
  await h.adjust();
  assert.equal(h.fetches.find(item => item.method === 'POST')?.body?.action, 'start');
  assert.equal(h.fetches.find(item => item.method === 'POST')?.body?.quantity, 0);
});

test('a saved change followed by a failed refresh blocks another adjustment until counts reload', async () => {
  const h = harness({ on_hand: 10, reserved: 2, low_stock_threshold: 5 });
  await h.mount();
  h.change('inventory-action', 'remove');
  h.change('inventory-quantity', '1');
  h.change('inventory-reason', 'Damaged canister');
  h.failGet = true;
  await h.adjust();
  await h.adjust();
  assert.equal(h.fetches.filter(item => item.method === 'POST').length, 1);
  assert.ok(h.nodes().filter(node => node.type === 'fieldset').every(node => node.props.disabled));
});
