'use client';

import { useState, useRef, useMemo } from 'react';
import Fuse from 'fuse.js';
import { supabase, BankScreenshot, OcrEntry, Speler, NaamAlias, formatBedrag } from '@/lib/supabase';
import { Upload, Trash2, Loader2, FileImage, Check, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface WeekData {
  weekKey: string;
  weekLabel: string;
  weekNr: number;
  spelers: {
    speler: Speler;
    teBetalen: number;
    betaling: { betaal_status: string | null; te_weinig_bedrag: number } | null;
  }[];
  weekTotaal: number;
}

interface Props {
  screenshots: BankScreenshot[];
  spelers: Speler[];
  weken: WeekData[];
  onChanged: () => void;
}

function getWeekDateRange(weekKey: string): { label: string; weekNr: number } {
  const [yearStr, weekStr] = weekKey.split('-W');
  const year = parseInt(yearStr);
  const weekNr = parseInt(weekStr);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay();
  const isoWeek1Monday = new Date(jan4);
  isoWeek1Monday.setDate(jan4.getDate() - ((jan4Day + 6) % 7));
  const weekMonday = new Date(isoWeek1Monday);
  weekMonday.setDate(isoWeek1Monday.getDate() + (weekNr - 1) * 7);
  const saturday = new Date(weekMonday);
  saturday.setDate(weekMonday.getDate() + 5);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  const fmt = (d: Date) => format(d, 'dd-MM-yyyy');
  return { label: `Week ${weekNr}: ${fmt(saturday)} t/m ${fmt(sunday)}`, weekNr };
}

function parseBedragToCents(s: string): number {
  const cleaned = s.replace(/[^0-9,.]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function useFuzzyMatcher(spelers: Speler[], aliases: NaamAlias[]) {
  const aliasToSpeler = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aliases) {
      m.set(a.alias.toLowerCase(), a.speler_id);
    }
    return m;
  }, [aliases]);

  const fuse = useMemo(() => {
    const spelerOptions = spelers.map(s => ({ id: s.id, naam: s.naam }));
    return new Fuse(spelerOptions, {
      keys: ['naam'],
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }, [spelers]);

  function matchName(ocrNaam: string): Speler | null {
    const lower = ocrNaam.toLowerCase().trim();

    const directAlias = aliasToSpeler.get(lower);
    if (directAlias) {
      const sp = spelers.find(s => s.id === directAlias);
      if (sp) return sp;
    }

    for (const [alias, spelerId] of Array.from(aliasToSpeler.entries())) {
      if (lower.includes(alias) || alias.includes(lower)) {
        const sp = spelers.find(s => s.id === spelerId);
        if (sp) return sp;
      }
    }

    const result = fuse.search(ocrNaam);
    if (result.length > 0 && result[0].score !== undefined && result[0].score < 0.4) {
      const matched = result[0].item;
      return spelers.find(s => s.id === matched.id) ?? null;
    }

    const nameParts = lower.split(/\s+/);
    for (const part of nameParts) {
      if (part.length < 3) continue;
      const partResult = fuse.search(part);
      if (partResult.length > 0 && partResult[0].score !== undefined && partResult[0].score < 0.3) {
        const matched = partResult[0].item;
        return spelers.find(s => s.id === matched.id) ?? null;
      }
    }

    return null;
  }

  return { matchName };
}

interface ReviewRow {
  id: string;
  ocrNaam: string;
  bedragCents: number;
  spelerId: string | null;
  status: 'betaald' | 'te_weinig_betaald' | 'niet_betaald' | 'te_laag_betaald';
  teWeinigBedrag: number;
}

export default function AfgerondTab({ screenshots, spelers, weken, onChanged }: Props) {
  const [uploading, setUploading] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [reviewWeek, setReviewWeek] = useState<string | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [aliases, setAliases] = useState<NaamAlias[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { matchName } = useFuzzyMatcher(spelers, aliases);

  const screenshotsByWeek = useMemo(() => {
    const m = new Map<string, BankScreenshot[]>();
    for (const s of screenshots) {
      if (!m.has(s.week_key)) m.set(s.week_key, []);
      m.get(s.week_key)!.push(s);
    }
    return m;
  }, [screenshots]);

  const weekDataMap = useMemo(() => {
    const m = new Map<string, WeekData>();
    for (const w of weken) m.set(w.weekKey, w);
    return m;
  }, [weken]);

  const weekKeysWithScreenshots = useMemo(() => {
    return Array.from(screenshotsByWeek.keys())
      .sort((a, b) => b.localeCompare(a));
  }, [screenshotsByWeek]);

  async function loadAliases() {
    const { data } = await supabase.from('naam_aliases').select('*');
    setAliases(data as NaamAlias[] ?? []);
  }

  useMemo(() => { loadAliases(); }, []);

  async function handleUpload(weekKey: string, files: FileList) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setUploading(true);
    setScanError(null);
    setScanStatus(`Bestand 1/${fileArray.length} uploaden...`);

    let geminiKey: string | null = null;
    try {
      const { data: cats } = await supabase
        .from('boetecategorieen')
        .select('naam')
        .like('naam', '__GEMINI__%')
        .maybeSingle();
      geminiKey = cats ? cats.naam.slice('__GEMINI__'.length) : null;
    } catch {
      // network error — geminiKey stays null
    }

    if (!geminiKey) {
      setUploading(false);
      setScanStatus('');
      setScanError('Geen Gemini API-sleutel ingesteld. Voeg je sleutel toe onder Instellingen > Overig.');
      return;
    }

    const allRows: ReviewRow[] = [];
    let rowIdx = 0;

    for (let fi = 0; fi < fileArray.length; fi++) {
      const file = fileArray[fi];
      setScanStatus(`Bestand ${fi + 1}/${fileArray.length} uploaden...`);

      const fileName = `${weekKey}/${Date.now()}-${fi}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('bank-screenshots')
        .upload(fileName, file);

      if (uploadError) {
        setUploading(false);
        setScanStatus('');
        setScanError(`Upload mislukt (${file.name}): ${uploadError.message}`);
        return;
      }

      setScanStatus(`Screenshot ${fi + 1}/${fileArray.length} scannen met AI...`);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64Image = btoa(binary);

        const response = await fetch('/api/scan-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData: base64Image, mimeType: file.type, geminiKey }),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error ?? `Scan faalde (${response.status})`);
        }

        const { transactions } = await response.json() as {
          transactions: { naam: string; bedrag: string; bedrag_cents: number; datum: string | null }[];
        };

        const rawEntries = transactions.map(t => ({
          naam: t.naam,
          bedrag: t.bedrag,
          bedrag_cents: t.bedrag_cents,
        }));

        const weekData = weekDataMap.get(weekKey);

        const rows: ReviewRow[] = rawEntries.map((entry) => {
          const matchedSpeler = matchName(entry.naam);
          const spelerId = matchedSpeler?.id ?? null;

          let status: ReviewRow['status'] = 'niet_betaald';
          let teWeinigBedrag = 0;

          if (spelerId && weekData) {
            const spelerWeek = weekData.spelers.find(s => s.speler.id === spelerId);
            if (spelerWeek) {
              const teBetalen = spelerWeek.teBetalen;
              const gelezen = entry.bedrag_cents;
              if (gelezen <= 0) {
                status = 'niet_betaald';
              } else if (gelezen >= teBetalen) {
                status = 'betaald';
              } else {
                status = 'te_weinig_betaald';
                teWeinigBedrag = teBetalen - gelezen;
              }
            }
          }

          return {
            id: `${rowIdx++}`,
            ocrNaam: entry.naam,
            bedragCents: entry.bedrag_cents,
            spelerId,
            status,
            teWeinigBedrag,
          };
        });

        await supabase.from('bank_screenshots').insert({
          week_key: weekKey,
          storage_path: fileName,
          ocr_result: rawEntries.map(e => ({
            naam: e.naam,
            bedrag: e.bedrag,
            bedrag_cents: e.bedrag_cents,
            speler_id: null,
            matched_status: null,
          })) as OcrEntry[],
        });

        allRows.push(...rows);
      } catch (err: any) {
        setUploading(false);
        setScanStatus('');
        setScanError(`Scan mislukt (${file.name}): ${err.message}`);
        return;
      }
    }

    setReviewRows(allRows);
    setReviewWeek(weekKey);
    setScanStatus('Betaalstatus automatisch invullen...');
    setUploading(false);

    await autoSaveBetaald(weekKey, allRows);

    setScanStatus('');
    onChanged();
  }

  async function autoSaveBetaald(weekKey: string, rows: ReviewRow[]) {
    const spelerStatusMap = new Map<string, { status: string; teWeinig: number }>();

    for (const row of rows) {
      if (!row.spelerId) continue;
      const teWeinig = row.status === 'te_weinig_betaald' ? row.teWeinigBedrag : 0;
      const status = row.status === 'te_laag_betaald' ? 'te_laag_betaald' : row.status;
      const existing = spelerStatusMap.get(row.spelerId);
      if (existing) {
        if (status === 'betaald') {
          spelerStatusMap.set(row.spelerId, { status: 'betaald', teWeinig: 0 });
        } else if (status === 'te_weinig_betaald' && existing.status !== 'betaald') {
          spelerStatusMap.set(row.spelerId, { status: 'te_weinig_betaald', teWeinig: Math.max(existing.teWeinig, teWeinig) });
        }
      } else {
        spelerStatusMap.set(row.spelerId, { status, teWeinig });
      }
    }

    for (const [spelerId, { status, teWeinig }] of Array.from(spelerStatusMap.entries())) {
      await supabase.from('betalingen').upsert({
        speler_id: spelerId,
        week_key: weekKey,
        betaal_status: status,
        te_weinig_bedrag: teWeinig,
      }, { onConflict: 'speler_id,week_key' });
    }

    const ocrResult: OcrEntry[] = rows.map(r => ({
      naam: r.ocrNaam,
      bedrag: `€${(r.bedragCents / 100).toFixed(2).replace('.', ',')}`,
      bedrag_cents: r.bedragCents,
      speler_id: r.spelerId,
      matched_status: r.spelerId ? r.status : null,
    }));

    const weekShots = screenshotsByWeek.get(weekKey) ?? [];
    for (const shot of weekShots) {
      await supabase.from('bank_screenshots').update({ ocr_result: ocrResult }).eq('id', shot.id);
    }

    const existingAliasSet = new Set(aliases.map(a => `${a.speler_id}:${a.alias.toLowerCase()}`));
    const newAliases: { alias: string; speler_id: string }[] = [];
    for (const row of rows) {
      if (!row.spelerId || !row.ocrNaam.trim()) continue;
      const key = `${row.spelerId}:${row.ocrNaam.toLowerCase().trim()}`;
      if (!existingAliasSet.has(key)) {
        newAliases.push({ alias: row.ocrNaam.trim(), speler_id: row.spelerId });
        existingAliasSet.add(key);
      }
    }
    if (newAliases.length > 0) {
      await supabase.from('naam_aliases').insert(newAliases);
      await loadAliases();
    }
  }

  async function confirmReview() {
    if (!reviewWeek) return;
    setSaving(true);
    await autoSaveBetaald(reviewWeek, reviewRows);
    setSaving(false);
    setReviewWeek(null);
    setReviewRows([]);
    onChanged();
  }

  async function deleteScreenshot(id: string, storagePath: string) {
    await supabase.storage.from('bank-screenshots').remove([storagePath]);
    await supabase.from('bank_screenshots').delete().eq('id', id);
    onChanged();
  }

  function updateRow(id: string, updates: Partial<ReviewRow>) {
    setReviewRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, ...updates };
      if (updates.spelerId !== undefined && reviewWeek) {
        const weekData = weekDataMap.get(reviewWeek);
        if (weekData && updated.spelerId) {
          const spelerWeek = weekData.spelers.find(s => s.speler.id === updated.spelerId);
          if (spelerWeek) {
            const teBetalen = spelerWeek.teBetalen;
            if (updated.bedragCents <= 0) {
              updated.status = 'niet_betaald';
              updated.teWeinigBedrag = 0;
            } else if (updated.bedragCents >= teBetalen) {
              updated.status = 'betaald';
              updated.teWeinigBedrag = 0;
            } else {
              updated.status = 'te_weinig_betaald';
              updated.teWeinigBedrag = teBetalen - updated.bedragCents;
            }
          }
        }
      }
      if (updates.bedragCents !== undefined && updated.spelerId && reviewWeek) {
        const weekData = weekDataMap.get(reviewWeek);
        if (weekData) {
          const spelerWeek = weekData.spelers.find(s => s.speler.id === updated.spelerId);
          if (spelerWeek) {
            const teBetalen = spelerWeek.teBetalen;
            if (updated.bedragCents <= 0) {
              updated.status = 'niet_betaald';
              updated.teWeinigBedrag = 0;
            } else if (updated.bedragCents >= teBetalen) {
              updated.status = 'betaald';
              updated.teWeinigBedrag = 0;
            } else {
              updated.status = 'te_weinig_betaald';
              updated.teWeinigBedrag = teBetalen - updated.bedragCents;
            }
          }
        }
      }
      return updated;
    }));
  }

  const statusColors: Record<string, string> = {
    betaald: 'bg-green-100 text-green-700',
    te_weinig_betaald: 'bg-amber-100 text-amber-700',
    niet_betaald: 'bg-red-100 text-red-700',
    te_laag_betaald: 'bg-orange-100 text-orange-700',
  };

  const statusLabels: Record<string, string> = {
    betaald: 'Betaald',
    te_weinig_betaald: 'Te weinig betaald',
    niet_betaald: 'Niet betaald',
    te_laag_betaald: 'Te laat betaald',
  };

  return (
    <div className="space-y-4">
      {/* Upload section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Screenshot uploaden</p>
        {weken.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nog geen boeteweken beschikbaar.</p>
        ) : (
          <div className="space-y-2">
            <select
              id="week-select"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Selecteer week...</option>
              {weken.map(w => (
                <option key={w.weekKey} value={w.weekKey}>{w.weekLabel}</option>
              ))}
            </select>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => {
                const files = e.target.files;
                const select = document.getElementById('week-select') as HTMLSelectElement;
                const weekKey = select?.value;
                if (files && files.length > 0 && weekKey) handleUpload(weekKey, files);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload screenshot
            </button>
          </div>
        )}
        {uploading && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span className="text-xs text-gray-500">{scanStatus}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
        {scanError && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{scanError}</p>
          </div>
        )}
      </div>

      {/* Review checklist */}
      {reviewWeek && (
        <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-bold text-blue-900">Controlelijst — {getWeekDateRange(reviewWeek).label}</p>
            </div>
            <p className="text-xs text-blue-600 mt-1">Betaalstatus is automatisch ingevuld. Controleer de koppelingen en bedragen en pas aan indien nodig.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                  <th className="text-left px-4 py-2 font-semibold">Gedetecteerde naam</th>
                  <th className="text-left px-4 py-2 font-semibold">Gekoppelde speler</th>
                  <th className="text-right px-4 py-2 font-semibold">Bedrag</th>
                  <th className="text-left px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map(row => {
                  const weekData = weekDataMap.get(reviewWeek);
                  const spelerWeek = row.spelerId ? weekData?.spelers.find(s => s.speler.id === row.spelerId) : null;
                  const teBetalen = spelerWeek?.teBetalen ?? 0;
                  return (
                    <tr key={row.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3 text-gray-700 font-medium">{row.ocrNaam}</td>
                      <td className="px-4 py-3">
                        <select
                          value={row.spelerId ?? ''}
                          onChange={e => updateRow(row.id, { spelerId: e.target.value || null })}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">Geen koppeling</option>
                          {spelers.filter(s => s.actief).map(s => (
                            <option key={s.id} value={s.id}>{s.naam}</option>
                          ))}
                        </select>
                        {teBetalen > 0 && (
                          <span className="text-xs text-gray-400 block mt-0.5">Te betalen: {formatBedrag(teBetalen)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={(row.bedragCents / 100).toFixed(2).replace('.', ',')}
                          onChange={e => updateRow(row.id, { bedragCents: parseBedragToCents(e.target.value) })}
                          className="w-20 text-right px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.status}
                          onChange={e => updateRow(row.id, { status: e.target.value as ReviewRow['status'] })}
                          className={`px-2 py-1.5 rounded-lg text-xs font-medium border-0 ${statusColors[row.status]}`}
                        >
                          {Object.entries(statusLabels).map(([key, label]) => (
                            <option key={key} value={key} className="bg-white text-gray-700">{label}</option>
                          ))}
                        </select>
                        {row.status === 'te_weinig_betaald' && row.teWeinigBedrag > 0 && (
                          <span className="text-xs text-amber-600 block mt-0.5">Tekort: {formatBedrag(row.teWeinigBedrag)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {reviewRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                      Geen namen of bedragen herkend uit de screenshot. Probeer een duidere afbeelding.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
            <button
              onClick={() => { setReviewWeek(null); setReviewRows([]); }}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Annuleren
            </button>
            <button
              onClick={confirmReview}
              disabled={saving || reviewRows.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Bevestigen & Opslaan
            </button>
          </div>
        </div>
      )}

      {/* Saved screenshots per week */}
      {weekKeysWithScreenshots.length === 0 && !reviewWeek ? (
        <div className="text-center py-12 text-gray-400">
          <FileImage className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Nog geen screenshots geüpload</p>
          <p className="text-xs mt-1">Upload een screenshot voor een boeteweek</p>
        </div>
      ) : (
        <div className="space-y-3">
          {weekKeysWithScreenshots.map(wk => {
            const shots = screenshotsByWeek.get(wk)!;
            const { label } = getWeekDateRange(wk);
            const isExpanded = expandedWeek === wk;
            return (
              <div key={wk} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedWeek(isExpanded ? null : wk)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-400">{shots.length} screenshot{shots.length !== 1 ? 's' : ''}</p>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-50 p-4 space-y-4">
                    {shots.map(shot => {
                      const ocrEntries = (shot.ocr_result ?? []) as OcrEntry[];
                      const hasConfirmed = ocrEntries.length > 0 && ocrEntries.some(e => e.speler_id !== null);
                      return (
                        <div key={shot.id} className="bg-gray-50 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-500">
                              {new Date(shot.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className="flex items-center gap-2">
                              {hasConfirmed && (
                                <span className="text-xs text-green-600 font-medium">Verwerkt</span>
                              )}
                              <button
                                onClick={() => deleteScreenshot(shot.id, shot.storage_path)}
                                className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {ocrEntries.length > 0 ? (
                            <div className="space-y-1.5">
                              {ocrEntries.map((entry, i) => {
                                const matchedSpeler = entry.speler_id ? spelers.find(s => s.id === entry.speler_id) : null;
                                return (
                                  <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium text-gray-800">{entry.naam}</span>
                                      {matchedSpeler && (
                                        <span className="text-xs text-green-600 ml-2">→ {matchedSpeler.naam}</span>
                                      )}
                                    </div>
                                    <span className="text-sm font-bold text-blue-700">{entry.bedrag}</span>
                                    {entry.matched_status && (
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[entry.matched_status] ?? ''}`}>
                                        {statusLabels[entry.matched_status] ?? entry.matched_status}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic">Geen namen/bedragen herkend</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
