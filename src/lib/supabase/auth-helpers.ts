import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * Server helper for /account routes — middleware already guards these, so
 * this just returns the user (guaranteed non-null inside /account).
 * Use createAdminClient() when you need to read rows that are RLS-gated.
 */
export async function getSessionUser() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
