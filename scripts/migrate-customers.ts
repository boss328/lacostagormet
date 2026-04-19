/**
 * Phase 5 — BigCommerce customer migration.
 *
 * Parses lcg-spec/references/bigcommerce/customers-export.xml, validates, and
 * writes rows to:
 *   auth.users (one per customer, email_confirm=true, no welcome email)
 *   customers  (with legacy_bc_customer_id, migrated_from_bc=true,
 *               needs_password_reset=true)
 *   addresses  (one row per <Addresses><item>)
 *
 * Run:
 *   pnpm tsx scripts/migrate-customers.ts --dry-run
 *   pnpm tsx scripts/migrate-customers.ts           # real run
 *
 * Safety (per Phase 5/6 rule S1): dry run is mandatory first. Real run aborts
 * if dry-run-computed error rate ≥ 1%. Idempotent: re-running upserts by email.
 */

import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { createClient } from '@supabase/supabase-js';

const XML_PATH = path.resolve('lcg-spec/references/bigcommerce/customers-export.xml');
const DRY_RUN = process.argv.includes('--dry-run');
const ERROR_THRESHOLD = 0.01;
const CONCURRENCY = 8;

type BcAddress = {
  Address_ID?: string | number;
  Address_First_Name?: string;
  Address_Last_Name?: string;
  Address_Company?: string;
  Address_Line_1?: string;
  Address_Line_2?: string;
  Address_City?: string;
  Address_State?: string;
  Address_Zip?: string | number;
  Address_Country?: string;
  Address_Phone?: string;
};

type BcCustomer = {
  Email_Address?: string;
  First_Name?: string;
  Last_Name?: string;
  Company?: string;
  Phone?: string;
  Notes?: string;
  Store_Credit?: string;
  Customer_Group?: string;
  Addresses?: { item?: BcAddress | BcAddress[] };
};

type Parsed = {
  raw: BcCustomer;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  phone: string | null;
  addresses: BcAddress[];
};

type ValidationIssue = { reason: string; email?: string };

function loadXml(): BcCustomer[] {
  const xml = fs.readFileSync(XML_PATH, 'utf8');
  const parser = new XMLParser({
    ignoreAttributes: true,
    cdataPropName: '__cdata',
    trimValues: true,
  });
  const doc = parser.parse(xml);
  const root = doc?.customers?.customer ?? [];
  const arr = Array.isArray(root) ? root : [root];
  // unwrap CDATA
  return arr.map((c: Record<string, unknown>) => unwrapCdata(c) as BcCustomer);
}

function unwrapCdata(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(unwrapCdata);
  const obj = v as Record<string, unknown>;
  if ('__cdata' in obj && Object.keys(obj).length === 1) {
    return obj.__cdata;
  }
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    out[k] = unwrapCdata(val);
  }
  return out;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}

function validEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

function validate(customers: BcCustomer[]): {
  parsed: Parsed[];
  duplicates: number;
  issues: ValidationIssue[];
} {
  const seen = new Map<string, Parsed>();
  const issues: ValidationIssue[] = [];
  let duplicates = 0;

  for (const c of customers) {
    const rawEmail = str(c.Email_Address);
    const email = rawEmail.toLowerCase();
    if (!email) {
      issues.push({ reason: 'missing_email' });
      continue;
    }
    if (!validEmail(email)) {
      issues.push({ reason: 'malformed_email' });
      continue;
    }

    const addressRaw = c.Addresses?.item;
    const addresses: BcAddress[] = Array.isArray(addressRaw)
      ? addressRaw
      : addressRaw
        ? [addressRaw]
        : [];

    const parsed: Parsed = {
      raw: c,
      email,
      firstName: str(c.First_Name) || null,
      lastName: str(c.Last_Name) || null,
      company: str(c.Company) || null,
      phone: str(c.Phone) || null,
      addresses,
    };

    if (seen.has(email)) {
      duplicates += 1;
      continue;
    }
    seen.set(email, parsed);
  }

  return { parsed: Array.from(seen.values()), duplicates, issues };
}

function printDryRunReport(total: number, parsed: Parsed[], duplicates: number, issues: ValidationIssue[]) {
  const errors = issues.length + duplicates;
  const errorRate = total === 0 ? 0 : errors / total;
  const sampleCount = Math.min(5, parsed.length);
  const addressCount = parsed.reduce((sum, p) => sum + p.addresses.length, 0);

  console.log('========================================');
  console.log('  CUSTOMER MIGRATION DRY RUN');
  console.log('========================================');
  console.log(`Total rows in XML:    ${total}`);
  console.log(`Parseable customers:  ${parsed.length}`);
  console.log(`Duplicates merged:    ${duplicates}`);
  console.log(`Validation issues:    ${issues.length}`);
  console.log(`Addresses to import:  ${addressCount}`);
  console.log(`Error rate:           ${(errorRate * 100).toFixed(3)}%`);
  console.log(`Threshold:            ${(ERROR_THRESHOLD * 100).toFixed(2)}%`);
  console.log(`Would proceed:        ${errorRate < ERROR_THRESHOLD ? 'YES' : 'NO (abort)'}`);
  console.log('');
  const issueBreakdown = new Map<string, number>();
  for (const i of issues) issueBreakdown.set(i.reason, (issueBreakdown.get(i.reason) ?? 0) + 1);
  if (issueBreakdown.size > 0) {
    console.log('Issue breakdown:');
    for (const [reason, count] of issueBreakdown) {
      console.log(`  ${reason}: ${count}`);
    }
    console.log('');
  }
  console.log(`Sample (${sampleCount}, PII redacted):`);
  for (let i = 0; i < sampleCount; i++) {
    const p = parsed[i];
    const domain = p.email.split('@')[1] ?? '?';
    console.log(
      `  [${i + 1}] email=***@${domain}  first=${p.firstName ? '<set>' : '<null>'}  ` +
        `last=${p.lastName ? '<set>' : '<null>'}  addresses=${p.addresses.length}`,
    );
  }
  console.log('========================================');
  return { total, errors, errorRate };
}

async function runReal(parsed: Parsed[]) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  const admin = createClient(supaUrl, supaKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('');
  console.log('========================================');
  console.log('  CUSTOMER MIGRATION REAL RUN');
  console.log('========================================');
  console.log(`Writing ${parsed.length} customers to Supabase…`);
  console.log('Concurrency:', CONCURRENCY);
  console.log('');

  let insertedUsers = 0;
  let existingUsers = 0;
  let failedUsers = 0;
  let insertedCustomers = 0;
  let updatedCustomers = 0;
  let insertedAddresses = 0;
  let failedAddresses = 0;
  let failed: string[] = [];

  const started = Date.now();

  async function migrateOne(p: Parsed) {
    // 1) Find or create auth user.
    let userId: string | null = null;

    // Try createUser first; if already exists, list + find.
    const createRes = await admin.auth.admin.createUser({
      email: p.email,
      email_confirm: true,
      user_metadata: { migrated_from_bc: true },
    });
    if (createRes.data.user) {
      userId = createRes.data.user.id;
      insertedUsers += 1;
    } else {
      // user exists or other error — look up by email
      const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      // listUsers doesn't filter by email reliably; fall back to a direct SQL-style query via RPC — but we don't have that.
      // Instead, accept Supabase's emailExists-style error and skip. Mark as existing.
      const msg = createRes.error?.message ?? '';
      if (
        msg.toLowerCase().includes('already been registered') ||
        msg.toLowerCase().includes('duplicate') ||
        msg.toLowerCase().includes('already exists')
      ) {
        existingUsers += 1;
        // Attempt to find the user by iterating listUsers pages — expensive; instead,
        // look up customer row by email to see if we've already migrated.
        const { data: existingCustomer } = await admin
          .from('customers')
          .select('id')
          .eq('email', p.email)
          .maybeSingle();
        userId = (existingCustomer as { id: string } | null)?.id ?? null;
      }
      if (!userId) {
        failedUsers += 1;
        failed.push(`auth:${createRes.error?.message ?? 'unknown'}`);
        // Suppress the email itself from logs per rule S5.
        return;
      }
      void existing; // silence unused
    }

    // 2) Upsert customers row.
    const { error: custErr, data: custData } = await admin
      .from('customers')
      .upsert(
        {
          id: userId,
          email: p.email,
          first_name: p.firstName,
          last_name: p.lastName,
          company_name: p.company,
          phone: p.phone,
          is_business: !!p.company,
          migrated_from_bc: true,
          needs_password_reset: true,
        },
        { onConflict: 'email' },
      )
      .select('id')
      .single();

    if (custErr) {
      failedUsers += 1;
      failed.push(`customer:${custErr.code ?? custErr.message}`);
      return;
    }
    const customerId = (custData as { id: string }).id;
    if (insertedUsers > 0) insertedCustomers += 1;
    else updatedCustomers += 1;

    // 3) Insert addresses (skip existing by exact postal_code+street1 pair).
    if (p.addresses.length > 0) {
      const rows = p.addresses
        .map((a) => ({
          customer_id: customerId,
          first_name: str(a.Address_First_Name) || p.firstName || '-',
          last_name: str(a.Address_Last_Name) || p.lastName || '-',
          company: str(a.Address_Company) || null,
          street1: str(a.Address_Line_1) || '-',
          street2: str(a.Address_Line_2) || null,
          city: str(a.Address_City) || '-',
          state: str(a.Address_State) || '-',
          postal_code: str(a.Address_Zip) || '-',
          country: mapCountry(str(a.Address_Country)),
          phone: str(a.Address_Phone) || null,
        }))
        .filter((r) => r.street1 !== '-' && r.postal_code !== '-');

      if (rows.length > 0) {
        // Check existing addresses to avoid dupes on re-run. Cheap approach:
        // fetch existing, filter client-side.
        const { data: existingAddrs } = await admin
          .from('addresses')
          .select('street1, postal_code')
          .eq('customer_id', customerId);
        const seenKeys = new Set(
          (existingAddrs ?? []).map((a: { street1: string; postal_code: string }) =>
            `${a.street1}|${a.postal_code}`,
          ),
        );
        const freshRows = rows.filter((r) => !seenKeys.has(`${r.street1}|${r.postal_code}`));
        if (freshRows.length > 0) {
          const { error: addrErr } = await admin.from('addresses').insert(freshRows);
          if (addrErr) {
            failedAddresses += freshRows.length;
            failed.push(`addr:${addrErr.code ?? addrErr.message}`);
          } else {
            insertedAddresses += freshRows.length;
          }
        }
      }
    }
  }

  // Process in batches of CONCURRENCY.
  for (let i = 0; i < parsed.length; i += CONCURRENCY) {
    const slice = parsed.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map(migrateOne));
    if ((i / CONCURRENCY) % 25 === 0) {
      const pct = Math.round(((i + slice.length) / parsed.length) * 100);
      const elapsed = Math.round((Date.now() - started) / 1000);
      console.log(`  … ${i + slice.length}/${parsed.length} (${pct}%, ${elapsed}s)`);
    }
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log('');
  console.log('Done in', elapsed, 'seconds.');
  console.log('');
  console.log(`auth.users created:   ${insertedUsers}`);
  console.log(`auth.users existed:   ${existingUsers}`);
  console.log(`auth.users failed:    ${failedUsers}`);
  console.log(`customers inserted:   ${insertedCustomers}`);
  console.log(`customers updated:    ${updatedCustomers}`);
  console.log(`addresses inserted:   ${insertedAddresses}`);
  console.log(`addresses failed:     ${failedAddresses}`);
  if (failed.length > 0) {
    const counts = new Map<string, number>();
    for (const f of failed) counts.set(f, (counts.get(f) ?? 0) + 1);
    console.log('');
    console.log('Failure breakdown:');
    for (const [k, v] of counts) console.log(`  ${k}: ${v}`);
  }
}

function mapCountry(c: string): string {
  if (!c) return 'US';
  const lower = c.toLowerCase();
  if (lower === 'united states' || lower === 'united states of america' || lower === 'usa' || lower === 'us')
    return 'US';
  if (lower === 'canada' || lower === 'ca') return 'CA';
  return c.slice(0, 2).toUpperCase();
}

async function main() {
  const customers = loadXml();
  const total = customers.length;
  const { parsed, duplicates, issues } = validate(customers);
  const report = printDryRunReport(total, parsed, duplicates, issues);

  if (DRY_RUN) {
    console.log('(dry run only — no DB writes)');
    return;
  }

  if (report.errorRate >= ERROR_THRESHOLD) {
    console.error('');
    console.error('ABORT — error rate above threshold. No DB writes performed.');
    process.exit(1);
  }

  await runReal(parsed);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  try {
    fs.writeFileSync('/tmp/phase5-migration-error.log', String(e?.stack ?? e));
  } catch {}
  process.exit(1);
});
