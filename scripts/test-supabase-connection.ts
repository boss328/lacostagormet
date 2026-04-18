/**
 * Phase 0 sanity check: can we reach Supabase with the service role key?
 *
 * Runs three probes:
 *  1. Admin auth listUsers — confirms URL + service role + project liveness.
 *  2. Bogus-table select — confirms PostgREST is actually talking to Postgres
 *     (expected: "relation does not exist").
 *  3. Anon-client sanity — confirms the public anon key is shaped correctly.
 *
 * Raw `SELECT version()` is skipped because supabase-js routes through
 * PostgREST, which only exposes the `public` schema + whitelisted RPCs. We'd
 * have to deploy a `version()` RPC first — overkill for a connectivity test.
 *
 * Run: `pnpm tsx scripts/test-supabase-connection.ts`
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

// We can't import src/lib/supabase/admin.ts directly — it uses `server-only`
// which intentionally throws outside a Next.js build. Instead we reconstruct
// the same service-role client with identical options, so any drift in
// admin.ts's factory should be mirrored here.
function buildAdminClient(url: string, serviceKey: string) {
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY",
    );
    process.exit(1);
  }

  console.log(`→ URL:          ${url}`);
  console.log(`→ Anon key:     ${anonKey.slice(0, 16)}…`);
  console.log(`→ Service key:  ${serviceKey.slice(0, 16)}…\n`);

  const admin = buildAdminClient(url, serviceKey);

  // Probe 1: admin auth listUsers
  console.log("Probe 1 — admin.auth.admin.listUsers({ perPage: 1 })");
  const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (usersResult.error) {
    console.error("  ✗ ERROR:", usersResult.error.message);
    process.exit(1);
  }
  console.log(
    `  ✓ ok · returned ${usersResult.data.users.length} user(s)`,
  );

  // Probe 2: bogus table
  console.log("\nProbe 2 — admin.from('__does_not_exist_yet').select('*').limit(1)");
  const bogusResult = await admin
    .from("__does_not_exist_yet")
    .select("*")
    .limit(1);
  if (bogusResult.error) {
    console.log(
      `  ✓ Postgres replied: code=${bogusResult.error.code} message="${bogusResult.error.message}"`,
    );
  } else {
    console.log("  ? No error on bogus table — unexpected");
  }

  // Probe 3: anon client sanity
  console.log("\nProbe 3 — anon client getSession()");
  const anon = createSupabaseClient(url, anonKey);
  const sessionResult = await anon.auth.getSession();
  if (sessionResult.error) {
    console.error("  ✗ ERROR:", sessionResult.error.message);
    process.exit(1);
  }
  console.log(
    `  ✓ ok · session = ${sessionResult.data.session ? "present" : "null (expected for a fresh anon client)"}`,
  );

  console.log("\nAll probes passed. Supabase is reachable from this machine.");
}

main().catch((err) => {
  console.error("Unexpected failure:", err);
  process.exit(1);
});
