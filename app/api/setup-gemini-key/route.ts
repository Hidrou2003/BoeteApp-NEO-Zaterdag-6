import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

// Client with service role key (bypasses RLS) — used for admin operations
function adminClient() {
  return createClient(supabaseUrl, serviceKey);
}

// Try to add the gemini_api_key column if it doesn't exist yet.
// Uses the service role key; silently no-ops if the column is already there.
async function ensureColumn() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await adminClient().rpc('exec_sql', {
      query: 'ALTER TABLE app_instellingen ADD COLUMN IF NOT EXISTS gemini_api_key text;',
    });
  } catch {
    // exec_sql function may not exist; the column may already exist.
    // The upsert below will tell us if it works.
  }
}

export async function POST(req: Request) {
  try {
    const { geminiKey } = await req.json();

    if (!geminiKey || typeof geminiKey !== 'string') {
      return NextResponse.json({ error: 'Geen geldige API-sleutel meegeleverd' }, { status: 400 });
    }

    const client = adminClient();

    // Try upsert to app_instellingen with gemini_api_key
    const { error } = await client
      .from('app_instellingen')
      .upsert({ id: 1, gemini_api_key: geminiKey.trim() });

    if (error) {
      // Column might not exist yet — try adding it, then retry
      await ensureColumn();
      const { error: error2 } = await client
        .from('app_instellingen')
        .upsert({ id: 1, gemini_api_key: geminiKey.trim() });

      if (error2) {
        return NextResponse.json(
          { error: 'Kon sleutel niet opslaan in de database', details: error2.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const client = adminClient();

    const { data, error } = await client
      .from('app_instellingen')
      .select('gemini_api_key')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ geminiKey: null });
    }

    return NextResponse.json({ geminiKey: data?.gemini_api_key ?? null });
  } catch {
    return NextResponse.json({ geminiKey: null });
  }
}
