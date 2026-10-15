import { normalizeAddress } from '../src/lib/shipping/shipstation';
import { shippingFlags } from '../src/lib/shipping/flags';

// Read the current process environment only. Load an env file explicitly with
// Node's --env-file option when needed; never print values or provider bodies.
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: pnpm exec tsx scripts/check-shipping-config.ts [--check-carriers]');
    console.log('Default: local configuration checks only. --check-carriers: one GET /v2/carriers.');
    console.log('Reads the current process environment; no database calls, quotes, purchases, or emails.');
    return;
  }
  if (args.some(arg => arg !== '--check-carriers')) {
    console.error('Unsupported option. Use --help for usage.');
    process.exitCode = 2;
    return;
  }

  let invalid = false;
  for (const name of ['SHIPPING_ENABLED', 'SHIPPING_PURCHASE_ENABLED', 'READ_ONLY_PREVIEW']) {
    const value = process.env[name];
    if (value && !['true', 'false'].includes(value)) {
      console.error(`INVALID: ${name} must be true, false, or unset.`);
      invalid = true;
    }
  }
  const { enabled, purchaseEnabled, readOnlyPreview: preview, production } = shippingFlags(process.env);
  const apiKey = process.env.SHIPSTATION_API_KEY || '';
  const keyPresent = Boolean(apiKey.trim());
  if (keyPresent && apiKey !== apiKey.trim()) {
    console.error('INVALID: SHIPSTATION_API_KEY contains leading or trailing whitespace.');
    invalid = true;
  }
  console.log(`Shipping tools: ${enabled ? 'enabled' : 'disabled'}`);
  console.log(`Shipping enablement: ${process.env.SHIPPING_ENABLED ? 'explicit setting' : 'runtime default'}`);
  console.log(`Purchase flag: ${purchaseEnabled ? 'enabled' : 'disabled'}`);
  console.log(`Read-only preview: ${preview ? 'yes' : 'no'}`);
  console.log(`Production runtime gate: ${production ? 'yes' : 'no'}`);
  console.log(`ShipStation API key: ${keyPresent ? 'present; access not verified' : 'missing'}`);

  function addressValid(name: string, raw: string | undefined) {
    if (!raw) {
      console.log(`${name}: missing`);
      return false;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      normalizeAddress(parsed as Record<string, unknown>);
      console.log(`${name}: valid local U.S. address shape; delivery validity not verified`);
      return true;
    } catch {
      // JSON parsing errors can contain the raw address. Keep them private.
      console.error(`INVALID: ${name} must contain a complete U.S. address JSON object.`);
      invalid = true;
      return false;
    }
  }

  const originValid = addressValid('SHIPSTATION_SHIP_FROM_JSON', process.env.SHIPSTATION_SHIP_FROM_JSON);
  const returnValid = process.env.SHIPSTATION_RETURN_TO_JSON
    ? addressValid('SHIPSTATION_RETURN_TO_JSON', process.env.SHIPSTATION_RETURN_TO_JSON)
    : originValid;
  if (!process.env.SHIPSTATION_RETURN_TO_JSON) console.log(`Return address: ${originValid ? 'uses ship-from address' : 'awaiting ship-from address'}`);

  const ready = keyPresent && originValid && returnValid && !invalid;
  const capabilities = shippingFlags(process.env, ready);
  console.log(`Manual tracking gate: ${capabilities.canRecordManual ? 'open' : 'closed'}`);
  console.log(`Rate quote gate: ${capabilities.canQuote ? 'open' : 'closed'}`);
  console.log(`Label purchase gate: ${capabilities.canPurchase ? 'open' : 'closed'}`);
  console.log('Database migration, carrier billing, email delivery, and live label purchases are not verified by these checks.');
  if (!ready) console.log('SETUP PENDING: configure the API key and ship-from/return addresses before requesting rates.');
  if (purchaseEnabled && (!enabled || !ready || preview || !production)) {
    console.error('INVALID: purchasing is requested but one or more activation gates are closed.');
    invalid = true;
  }

  if (args.includes('--check-carriers')) {
    if (!keyPresent) {
      console.error('CARRIER CHECK FAILED: SHIPSTATION_API_KEY is required; no request was sent.');
      invalid = true;
    } else if (apiKey !== apiKey.trim()) {
      console.error('CARRIER CHECK FAILED: correct the API key whitespace first; no request was sent.');
      invalid = true;
    } else {
      try {
        const response = await fetch('https://api.shipstation.com/v2/carriers', {
          method: 'GET', headers: { 'API-Key': apiKey, Accept: 'application/json' },
          redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          const detail = [401, 403].includes(response.status)
            ? 'verify the V2 key and account API entitlement'
            : response.status === 429 ? 'rate limited; retry later' : 'check provider availability and account access';
          console.error(`CARRIER CHECK FAILED: HTTP ${response.status}; ${detail}.`);
          invalid = true;
        } else {
          const payload: unknown = await response.json();
          const carriers = payload && typeof payload === 'object' && 'carriers' in payload ? payload.carriers : null;
          if (!Array.isArray(carriers) || carriers.length === 0 || carriers.some(carrier => !carrier || typeof carrier.carrier_id !== 'string')) {
            console.error('CARRIER CHECK FAILED: no usable carrier connections returned; review the ShipStation account.');
            invalid = true;
          } else {
            // Account numbers, names, balances, and addresses may appear in this
            // response. Emit only a count; never log the payload or credentials.
            console.log(`CARRIER CHECK PASSED: ${carriers.length} connected carrier(s). No rates or labels requested.`);
          }
        }
      } catch {
        console.error('CARRIER CHECK FAILED: request timed out, failed, or returned an unreadable response.');
        invalid = true;
      }
    }
  } else {
    console.log('Carrier access: not checked. Use --check-carriers for the optional read-only API check.');
  }
  process.exitCode = invalid ? 1 : 0;
}

main().catch(() => {
  console.error('Shipping configuration check failed. Configuration values were not printed.');
  process.exitCode = 1;
});
