import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';

const MODEL_NAME = 'gemini-1.5-flash';

interface CorveeEntry {
  label: string;
  datum_start: string | null;
  datum_eind: string | null;
  namen: string[];
  is_break?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const { geminiKey, spelers, periodes, interval, spelersPerKeer } = await req.json();

    if (!geminiKey) {
      return NextResponse.json({ error: 'Geen Gemini API-sleutel geconfigureerd. Voeg je sleutel toe onder Instellingen > Overig.' }, { status: 400 });
    }

    if (!spelers || spelers.length === 0) {
      return NextResponse.json({ error: 'Geen spelers geselecteerd.' }, { status: 400 });
    }

    if (!periodes || periodes.length === 0) {
      return NextResponse.json({ error: 'Geen periodes opgegeven.' }, { status: 400 });
    }

    const prompt = `Je bent een hulp bij het maken van een corveeschema voor een voetbalteam. Je krijgt een lijst spelers, periodes (met start- en einddatums, sommige periodes zijn "break" zoals winterstop), een interval (per training/wedstrijd, per week, per twee weken, of per maand), en hoeveel spelers per corveebeurt nodig zijn.

Spelers: ${JSON.stringify(spelers)}
Periodes: ${JSON.stringify(periodes)}
Interval: ${interval}
Spelers per corveebeurt: ${spelersPerKeer}

Taak: Maak een corveeschema door de spelers eerlijk te verdelen over de periodes. Voor periodes die "break" zijn (zoals winterstop), maak een entry met is_break: true en geen namen. Verdeel de spelers roterend zodat iedereen ongeveer evenveel corvee doet.

Regels:
- Voor elke periode die geen break is, verdeel in groepen volgens het interval.
- Elke groep krijgt precies ${spelersPerKeer} spelers (tenzij het een break is).
- Probeer elke speler ongeveer evenveel keer in te delen.
- Geef elke groep een label zoals "Week 36" of "Training 1" afhankelijk van het interval.
- Geef datum_start en datum_eind als datums in formaat DD-MM-YYYY.

Geef het antwoord als een JSON array met objecten die "label", "datum_start", "datum_eind", "namen" (array van namen) en "is_break" (boolean) bevatten. Geef alleen de JSON array, geen andere tekst.`;

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
      const details = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: 'Gemini API-aanroep mislukt', details }, { status: 502 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
