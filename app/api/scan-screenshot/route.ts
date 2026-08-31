import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

    const apiKey = typeof geminiKey === 'string' ? geminiKey.trim() : '';
    const modelName = 'gemini-1.5-flash';
    const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=[verborgen]`;

    if (!apiKey) {
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

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: mimeType || 'image/png',
            data: imageData,
          },
        },
      ]);

      const textContent = result.response.text();

      if (!textContent) {
        return NextResponse.json(
          { error: 'Geen tekst ontvangen van Gemini', model: modelName, requestUrl },
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
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          error: 'Gemini API-aanroep mislukt',
          model: modelName,
          requestUrl,
          details,
        },
        { status: 502 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
