import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const MODEL_NAME = 'gemini-1.5-flash';

interface RijschemaEntry {
  datum: string;
  tijd: string | null;
  wedstrijd: string | null;
  chauffeurs: string[];
  is_fiets?: boolean;
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
    const { spelers, wedstrijden, chauffeursPerWedstrijd } = await req.json();

    if (!spelers || spelers.length === 0) {
      return NextResponse.json({ error: 'Geen spelers geselecteerd.' }, { status: 400 });
    }

    if (!wedstrijden || wedstrijden.length === 0) {
      return NextResponse.json({ error: 'Geen wedstrijden/datums opgegeven.' }, { status: 400 });
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

    const prompt = `Je bent een hulp bij het maken van een rijschema voor een voetbalteam. Je krijgt een lijst spelers, een lijst wedstrijden (met optioneel tijd en tegenstander), en hoeveel chauffeurs per wedstrijd nodig is.

Spelers: ${JSON.stringify(spelers)}
Aantal chauffeurs per wedstrijd: ${chauffeursPerWedstrijd}
Wedstrijden: ${JSON.stringify(wedstrijden)}

Taak: Verdeel de spelers zo eerlijk mogelijk over alle wedstrijden als chauffeurs. Elke speler moet ongeveer even vaak rijden. Probeer ook te voorkomen dat een speler twee wedstrijden kort achter elkaar moet rijden.

Regels:
- Elke wedstrijd moet precies ${chauffeursPerWedstrijd} chauffeurs krijgen (tenzij het een "fiets" wedstrijd is, dan 1 chauffeur met naam "Fiets" en is_fiets: true).
- Als een wedstrijd geen tegenstander heeft, zet dan bij wedstrijd: null.
- Als een wedstrijd geen tijd heeft, zet dan bij tijd: null.
- Verdeel de spelers eerlijk: probeer elk ongeveer evenveel keer te laten rijden.

Geef het antwoord als een JSON array met objecten die "datum", "tijd", "wedstrijd", "chauffeurs" (array van namen) en "is_fiets" (boolean) bevatten. Geef alleen de JSON array, geen andere tekst.`;

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

      let entries: RijschemaEntry[];
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
      console.error('Gemini API error in gen-rijschema:', err);
      const details = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: 'Gemini API-aanroep mislukt', details }, { status: 502 });
    }
  } catch (err) {
    console.error('Unexpected error in gen-rijschema:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
