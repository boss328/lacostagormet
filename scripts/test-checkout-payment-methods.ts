import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/components/checkout/CheckoutPaymentMethods.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

type Element = { type: unknown; props: Record<string, any> };
function elements(element: any): Element[] {
  if (Array.isArray(element)) return element.flatMap(elements);
  return element?.props ? [element, ...elements(element.props.children)] : [];
}

function setup({ wallets = false, readOnly = false } = {}) {
  const hooks: any[] = [];
  const requests: { method: string; body?: any }[] = [];
  const effects: (() => void)[] = [];
  let index = 0;
  let cardCheckouts = 0;
  let reportPaymentRequest!: () => void;
  const paymentRequested = new Promise<void>(resolve => { reportPaymentRequest = resolve; });
  const react = {
    useState(initial: unknown) {
      const slot = index++;
      if (!(slot in hooks)) hooks[slot] = initial;
      return [hooks[slot], (value: unknown) => { hooks[slot] = value; }];
    },
    useRef(initial: unknown) {
      const slot = index++;
      return hooks[slot] ??= { current: initial };
    },
    useEffect(effect: () => void, dependencies: unknown[]) {
      const slot = index++;
      if (!(slot in hooks) || dependencies.some((value, i) => hooks[slot][i] !== value)) effects.push(effect);
      hooks[slot] = dependencies;
    },
  };
  const modules: Record<string, unknown> = { react, 'react/jsx-runtime': require('react/jsx-runtime') };
  const target = { exports: {} as { CheckoutPaymentMethods: (props: unknown) => Element } };
  const fetch = async (_url: string, init: { method?: string; body?: string } = {}) => {
    requests.push({ method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === 'POST') reportPaymentRequest();
    return { ok: true, json: async () => init.method === 'POST' ? { attemptId: 'test-attempt', total: '47.00' } :
      { paypal: wallets, applePay: false, amazonPay: wallets } };
  };
  new Function('require', 'exports', 'fetch', compiled)((id: string) => {
    assert.ok(id in modules, `Unexpected import ${id}`);
    return modules[id];
  }, target.exports, fetch);
  const props = {
    total: 47, canContinue: false, readOnly, submittingCard: false,
    payload: { items: [{ product_id: 'test-item', quantity: 1 }], clientSubtotal: 47 },
    onActiveChange() {}, onPayByCard() { cardCheckouts++; },
  };
  const render = () => {
    index = 0;
    const tree = elements(target.exports.CheckoutPaymentMethods(props));
    effects.splice(0).forEach(effect => effect());
    return {
      radios: tree.filter(node => node.type === 'input').map(node => node.props),
      action: tree.find(node => node.type === 'button')?.props,
    };
  };
  return { render, props, requests, paymentRequested, get cardCheckouts() { return cardCheckouts; } };
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('card stays available when all wallets are disabled', async () => {
  const checkout = setup();
  checkout.render();
  await flush();
  checkout.props.canContinue = true;
  const view = checkout.render();
  assert.deepEqual(view.radios.map(r => [r.value, r.checked]), [['card', true]]);
  view.action!.onClick();
  assert.equal(checkout.cardCheckouts, 1);
  assert.deepEqual(checkout.requests.map(r => r.method), ['GET']);
});

test('choosing a wallet before entering an address creates no order, then Continue uses the selected wallet', { timeout: 5000 }, async () => {
  const checkout = setup({ wallets: true });
  checkout.render();
  await flush();
  const first = checkout.render();
  assert.deepEqual(first.radios.map(r => r.value), ['card', 'paypal', 'amazon_pay']);
  first.radios.find(r => r.value === 'amazon_pay')!.onChange();
  const selected = checkout.render();
  assert.equal(selected.radios.find(r => r.checked)?.value, 'amazon_pay');
  assert.equal(selected.action!.disabled, true);
  assert.deepEqual(checkout.requests.map(r => r.method), ['GET']);
  checkout.props.canContinue = true;
  const ready = checkout.render();
  assert.equal(ready.action!.disabled, false);
  ready.action!.onClick();
  await checkout.paymentRequested;
  assert.equal(checkout.requests[1]?.body.method, 'amazon_pay');
  assert.equal(checkout.cardCheckouts, 0);
});

test('a read-only preview does not load wallet configuration or enable payment', async () => {
  const checkout = setup({ wallets: true, readOnly: true });
  checkout.props.canContinue = true;
  const view = checkout.render();
  assert.equal(view.action!.disabled, true);
  assert.deepEqual(view.radios.map(r => r.value), ['card']);
  assert.deepEqual(checkout.requests, []);
});
