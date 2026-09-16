import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';

const MODEL_NAME = 'gemini-1.5-flash';

interface RijschemaEntry {
  datum: string;
  tijd: string | null;
  wedstrijd: string | null;
  chauffeurs: string[];
  is_fiets?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const { geminiKey, spelers, wedstrijden, chauffeursPerWedstrijd } = await req.json();

    if (!geminiKey) {
      return NextResponse.json({ error: 'Geen Gemini API-sleutel geconfigureerd. Voeg je sleutel toe onder Instellingen > Overig.' }, { status: 400 });
    }

    if (!spelers || spelers.length === 0) {
      return NextResponse.json({ error: 'Geen spelers geselecteerd.' }, { status: 400 });
    }

    if (!wedstrijden || wedstrijden.length === 0) {
      return NextResponse.json({ error: 'Geen wedstrijden/datums opgegeven.' }, { status: 400 });
    }

    const prompt = `Je bent een hulp bij het maken van een rijschema voor een voetbalteam. Je krijgt een lijst spelers, een lijst wedstrijden (met optioneel tijd en tegenstander), en hoeveel chauffeurs per wedstrijd nodig zijn.

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

    const genAI = new GoogleGenerativeAI(geminiKey.trim());

    try {
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
      const details = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: 'Gemini API-aanroep mislukt', details }, { status: 502 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
