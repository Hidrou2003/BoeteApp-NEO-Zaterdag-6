import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface Transaction {
  naam: string;
  bedrag: number;
  datum: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const { imageData, mimeType, geminiKey } = await req.json();

    if (!imageData) {
      return NextResponse.json(
        { error: 'Geen afbeelding meegeleverd' },
        { status: 400 }
      );
    }

    if (!geminiKey) {
      return NextResponse.json(
        { error: 'Geen Gemini API-sleutel geconfigureerd. Voeg je sleutel toe onder Instellingen > Overig.' },
        { status: 400 }
      );
    }

    const prompt = `Je bent een hulp bij het uitlezen van bankafschriften. Bekijk deze screenshot van een bankapp en haal alle transacties (overboekingen) eruit.

Geef per transactie het volgende terug:
- naam: De naam van de betaler. Verwijder toevoegingen zoals "via Rabo", "Betaalverzoek", "NSEPA", of banknamen. Houd alleen de werkelijke naam van de persoon of bedrijf.
- bedrag: Het overgemaakte bedrag als getal (float), zonder euroteken. Bijvoorbeeld: 5.00 of 12.50
- datum: De datum van de transactie als deze zichtbaar is, anders null. Formaat: YYYY-MM-DD als mogelijk, anders de ruwe tekst.

Negeer regels die geen transactie zijn, zoals "Saldo", "Afschrift", IBAN-nummers, of navigatie-elementen van de app.

Geef het antwoord als een JSON array met objecten die "naam", "bedrag" en "datum" bevatten. Geef alleen de JSON array, geen andere tekst.`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType || 'image/png',
                data: imageData,
              },
            },
          ],
        },
      ],
      generation_config: {
        temperature: 0.1,
        response_mime_type: 'application/json',
      },
    };

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    let geminiResponse: Response | null = null;
    let lastError = '';

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      geminiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (geminiResponse.ok) break;

      lastError = await geminiResponse.text();
      if (geminiResponse.status === 404) continue;
      break;
    }

    if (!geminiResponse || !geminiResponse.ok) {
      return NextResponse.json(
        { error: `Gemini API fout: ${geminiResponse?.status ?? 0}`, details: lastError },
        { status: 502 }
      );
    }

    const geminiData = await geminiResponse.json();
    const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return NextResponse.json(
        { error: 'Geen tekst ontvangen van Gemini' },
        { status: 502 }
      );
    }

    let transactions: Transaction[];
    try {
      const cleaned = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      transactions = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: 'Kon JSON niet parsen', raw: textContent },
        { status: 502 }
      );
    }

    if (!Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'Onverwacht antwoordformaat van Gemini' },
        { status: 502 }
      );
    }

    const entries = transactions
      .filter((t) => t.naam && typeof t.bedrag === 'number')
      .map((t) => ({
        naam: String(t.naam).trim(),
        bedrag: `€${Number(t.bedrag).toFixed(2).replace('.', ',')}`,
        bedrag_cents: Math.round(Number(t.bedrag) * 100),
        datum: t.datum ?? null,
      }));

    return NextResponse.json({ transactions: entries });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
