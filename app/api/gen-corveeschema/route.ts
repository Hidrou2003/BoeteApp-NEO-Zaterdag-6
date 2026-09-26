import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const MODEL_NAME = 'gemini-1.5-flash';

interface CorveeEntry {
  label: string;
  datum_start: string | null;
  datum_eind: string | null;
  namen: string[];
  is_break?: boolean;
}

async function getGeminiKey(): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  const admin = createClient(supabaseUrl, serviceKey);
  const { data } = await admin
    .from('boetecategorieen')
    .select('naam')
    .like('naam', '__GEMINI__%')
    .limit(1);
  if (!data || data.length === 0) return null;
  return data[0].naam.slice('__GEMINI__'.length).trim();
}

export async function POST(req: NextRequest) {
  try {
    const { spelers, periodes, interval, spelersPerKeer } = await req.json();

    if (!spelers || spelers.length === 0) {
      return NextResponse.json({ error: 'Geen spelers geselecteerd.' }, { status: 400 });
    }

    if (!periodes || periodes.length === 0) {
      return NextResponse.json({ error: 'Geen periodes opgegeven.' }, { status: 400 });
    }

    let geminiKey: string | null = null;
    try {
      geminiKey = await getGeminiKey();
    } catch (fetchErr) {
      console.error('Failed to fetch Gemini key from DB:', fetchErr);
    }

    if (!geminiKey) {
      return NextResponse.json(
        { error: 'Geen Gemini API-sleutel gevonden in de instellingen. Stel deze in onder Instellingen > Overig.' },
        { status: 400 }
      );
    }

    const prompt = `Je bent een hulp bij het maken van een corveeschema voor een voetbalteam. Je krijgt een lijst spelers, periodes (met start- en einddatums), een interval (per training/wedstrijd, per week, per twee weken, of per maand), en hoeveel spelers per corveebeurt nodig zijn.

Spelers: ${JSON.stringify(spelers)}
Periodes: ${JSON.stringify(periodes)}
Interval: ${interval}
Spelers per corveebeurt: ${spelersPerKeer}

Taak: Maak een corveeschema door de spelers eerlijk te verdelen over de periodes. Verdeel de spelers roterend zodat iedereen ongeveer evenveel corvee doet.

Regels:
- Voor elke periode, verdeel in groepen volgens het interval.
- Elke groep krijgt precies ${spelersPerKeer} spelers.
- Probeer elke speler ongeveer evenveel keer in te delen.
- Geef elke groep een label zoals "Week 36" of "Training 1" afhankelijk van het interval.
- Geef datum_start en datum_eind als datums in formaat DD-MM-YYYY.

Geef het antwoord als een JSON array met objecten die "label", "datum_start", "datum_eind", "namen" (array van namen) en "is_break" (boolean) bevatten. Geef alleen de JSON array, geen andere tekst.`;

    try {
      const genAI = new GoogleGenerativeAI(geminiKey.trim());
      const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
      });

      const result = await model.generateContent([prompt]);
      const textContent = result.response.text();

      if (!textContent) {
        return NextResponse.json({ error: 'Geen tekst ontvangen van Gemini' }, { status: 502 });
      }

      let entries: CorveeEntry[];
      try {
        const cleaned = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        entries = JSON.parse(cleaned);
      } catch {
        return NextResponse.json({ error: 'Kon JSON niet parsen', raw: textContent }, { status: 502 });
      }

      if (!Array.isArray(entries)) {
        return NextResponse.json({ error: 'Onverwacht antwoordformaat van Gemini' }, { status: 502 });
      }

      return NextResponse.json({ entries });
    } catch (err: unknown) {
      console.error('Gemini API error in gen-corveeschema:', err);
      const details = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: 'Gemini API-aanroep mislukt', details }, { status: 502 });
    }
  } catch (err) {
    console.error('Unexpected error in gen-corveeschema:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
