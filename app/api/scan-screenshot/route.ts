import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';

const MODEL_NAME = 'gemini-1.5-flash';
const MAX_RETRIES = 3;

interface Transaction {
  naam: string;
  bedrag: number;
  datum: string | null;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('503') || msg.includes('service unavailable') || msg.includes('rate') || msg.includes('overloaded') || msg.includes('quota');
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
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    let textContent: string | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              mimeType: mimeType || 'image/png',
              data: imageData,
            },
          },
        ]);
        textContent = result.response.text();
        break;
      } catch (err: unknown) {
        lastError = err;
        console.error(`Gemini attempt ${attempt + 1}/${MAX_RETRIES} failed:`, err instanceof Error ? err.message : err);
        if (isRetryableError(err) && attempt < MAX_RETRIES - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await sleep(backoffMs);
          continue;
        }
        throw err;
      }
    }

    if (!textContent) {
      const msg = lastError instanceof Error ? lastError.message : 'Onbekende fout';
      console.error('Gemini scan failed after retries:', msg);
      return NextResponse.json(
        { error: 'Gemini API-aanroep mislukt', model: MODEL_NAME, details: msg },
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
    console.error('Screenshot scan error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
