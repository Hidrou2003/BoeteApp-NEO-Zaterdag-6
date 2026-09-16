'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Speler, Rijschema, RijschemaItem, GEMINI_PREFIX, extractGeminiKey } from '@/lib/supabase';
import { Car, MapPin, Plus, Trash2, Check, X, Sparkles, Calendar, Clock, Users, RefreshCw, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

const STATIC_RIJSCHEMA = [
  { datum: 'Za 05-09-2026', tijd: '14:30', wedstrijd: 'Hulzense Boys 3 – NEO 6', chauffeurs: ['Ewen', 'Max B', 'Thijmen', 'Nick'] },
  { datum: 'Za 19-09-2026', tijd: '16:00', wedstrijd: 'De Tukkers 3 – NEO 6', chauffeurs: ['Nick', 'Guus', 'Jorn', 'Niek'] },
  { datum: 'Za 03-10-2026', tijd: '16:00', wedstrijd: "Achilles '12 3 – NEO 6", chauffeurs: ['Rick', 'Niek', 'Max N', 'Hidde R'] },
  { datum: 'Za 24-10-2026', tijd: '14:30', wedstrijd: 'RKSV Bornerbroek 2 – NEO 6', chauffeurs: ['Lucas', 'Joep', 'Thomas', 'Tim'] },
  { datum: 'Za 07-11-2026', tijd: '12:30', wedstrijd: 'ESC Glanerbrug 3 – NEO 6', chauffeurs: ['Julian', 'Haye', 'Emiel', 'Bjorn'] },
  { datum: 'Za 28-11-2026', tijd: '14:45', wedstrijd: 'PH 4 – NEO 6', chauffeurs: ['Ewen', 'Max B', 'Thijmen', 'Hidde G'] },
  { datum: 'Za 05-12-2026', tijd: '12:30', wedstrijd: 'FC Aramea 2 – NEO 6', chauffeurs: ['Rick', 'Guus', 'Jorn', 'Max N'] },
  { datum: 'Za 23-01-2027', tijd: '14:45', wedstrijd: "Quick '20 4 – NEO 6", chauffeurs: ['Jorn', 'Niek', 'Max N', 'Hidde R'] },
  { datum: 'Za 13-03-2027', tijd: '16:30', wedstrijd: 'S.V. Losser 4 – NEO 6', chauffeurs: ['Lucas', 'Joep', 'Thomas', 'Tim'] },
  { datum: 'Za 03-04-2027', tijd: '15:00', wedstrijd: 'Bon Boys 4 – NEO 6', chauffeurs: ['Julian', 'Haye', 'Emiel', 'Bjorn'] },
  { datum: 'Za 24-04-2027', tijd: '12:30', wedstrijd: 'Oranje Nassau 4 – NEO 6', chauffeurs: ['Max B', 'Thijmen', 'Thomas', 'Hidde G'] },
  { datum: 'Za 22-05-2027', tijd: '14:30', wedstrijd: 'Fiets', chauffeurs: ['Fiets'], isFiets: true },
];

interface WedstrijdInput {
  datum: string;
  tijd: string;
  tegenstander: string;
}

export default function RijschemaPage() {
  return (
    <AuthGuard>
      <AppShell>
        <RijschemaContent />
      </AppShell>
    </AuthGuard>
  );
}

function RijschemaContent() {
  const { profile } = useAuth();
  const isBeheerder = profile?.rol === 'beheerder' || profile?.rol === 'hoofdbeheerder';

  const [spelers, setSpelers] = useState<Speler[]>([]);
  const [schemas, setSchemas] = useState<Rijschema[]>([]);
  const [items, setItems] = useState<RijschemaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  const [view, setView] = useState<'static' | 'db'>('static');

  // Generator state
  const [selectedSpelers, setSelectedSpelers] = useState<string[]>([]);
  const [wedstrijden, setWedstrijden] = useState<WedstrijdInput[]>([{ datum: '', tijd: '', tegenstander: '' }]);
  const [chauffeursPerWedstrijd, setChauffeursPerWedstrijd] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genResult, setGenResult] = useState<RijschemaItem[] | null>(null);
  const [schemaNaam, setSchemaNaam] = useState('');
  const [geminiKey, setGeminiKey] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: sps }, { data: sch }, { data: its }] = await Promise.all([
      supabase.from('spelers').select('*').eq('actief', true).order('naam'),
      supabase.from('rij schemas').select('*').order('created_at', { ascending: false }),
      supabase.from('rijschema_items').select('*').order('volgorde'),
    ]);
    setSpelers(sps ?? []);
    setSchemas(sch ?? []);
    setItems(its ?? []);
    setLoading(false);
  }

  function toggleSpeler(id: string) {
    setSelectedSpelers(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function updateWedstrijd(idx: number, field: keyof WedstrijdInput, value: string) {
    setWedstrijden(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  }

  function addWedstrijd() {
    setWedstrijden(prev => [...prev, { datum: '', tijd: '', tegenstander: '' }]);
  }

  function removeWedstrijd(idx: number) {
    setWedstrijden(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    setGenResult(null);

    const spelerNamen = spelers.filter(s => selectedSpelers.includes(s.id)).map(s => s.naam);
    const wData = wedstrijden
      .filter(w => w.datum.trim())
      .map(w => ({
        datum: w.datum,
        tijd: w.tijd.trim() || null,
        tegenstander: w.tegenstander.trim() || null,
      }));

    if (spelerNamen.length < chauffeursPerWedstrijd) {
      setGenError(`Je hebt ${spelerNamen.length} spelers geselecteerd maar ${chauffeursPerWedstrijd} chauffeurs per wedstrijd nodig.`);
      setGenerating(false);
      return;
    }

    if (wData.length === 0) {
      setGenError('Voeg minimaal één wedstrijd met een datum toe.');
      setGenerating(false);
      return;
    }

    try {
      const resp = await fetch('/api/gen-rijschema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiKey, spelers: spelerNamen, wedstrijden: wData, chauffeursPerWedstrijd }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setGenError(data.error || 'Genereren mislukt');
        setGenerating(false);
        return;
      }
      const entries: RijschemaItem[] = data.entries.map((e: any, i: number) => ({
        id: `temp-${i}`,
        rijschema_id: 'temp',
        datum: e.datum,
        tijd: e.tijd,
        wedstrijd: e.wedstrijd,
        chauffeurs: e.chauffeurs || [],
        is_fiets: e.is_fiets || false,
        volgorde: i,
        created_at: '',
      }));
      setGenResult(entries);
    } catch (err) {
      setGenError('Netwerkfout bij genereren');
    }
    setGenerating(false);
  }

  async function saveSchema() {
    if (!genResult || !schemaNaam.trim()) return;
    const { data: newSchema, error } = await supabase.from('rij schemas').insert({
      naam: schemaNaam.trim(),
      seizoen: schemaNaam.trim(),
    }).select().single();

    if (error || !newSchema) return;

    const itemsToInsert = genResult.map((item, i) => ({
      rijschema_id: newSchema.id,
      datum: item.datum,
      tijd: item.tijd,
      wedstrijd: item.wedstrijd,
      chauffeurs: item.chauffeurs,
      is_fiets: item.is_fiets,
      volgorde: i,
    }));

    await supabase.from('rijschema_items').insert(itemsToInsert);

    setGenResult(null);
    setSchemaNaam('');
    setShowGenerator(false);
    setWedstrijden([{ datum: '', tijd: '', tegenstander: '' }]);
    setSelectedSpelers([]);
    load();
  }

  async function setActiveSchema(id: string) {
    await supabase.from('rij schemas').update({ actief: false }).neq('id', id);
    await supabase.from('rij schemas').update({ actief: true }).eq('id', id);
    load();
  }

  async function deleteSchema(id: string) {
    await supabase.from('rij schemas').delete().eq('id', id);
    load();
  }

  const activeSchema = schemas.find(s => s.actief);
  const activeItems = items.filter(i => i.rijschema_id === activeSchema?.id);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rijschema</h1>
          <p className="text-sm text-gray-500">NEO Zaterdag 6 — Seizoen 2026/2027</p>
        </div>
        {isBeheerder && (
          <button
            onClick={() => setShowGenerator(!showGenerator)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            Nieuw schema
          </button>
        )}
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('static')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${view === 'static' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          Statisch schema
        </button>
        <button
          onClick={() => setView('db')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${view === 'db' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          Gegenereerd{activeSchema ? `: ${activeSchema.naam}` : ''}
        </button>
      </div>

      {/* Generator */}
      {showGenerator && isBeheerder && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Nieuw rijschema genereren</h2>
          </div>

          {/* Speler selectie */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Selecteer spelers</label>
            <div className="flex flex-wrap gap-2">
              {spelers.map(sp => (
                <button
                  key={sp.id}
                  onClick={() => toggleSpeler(sp.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedSpelers.includes(sp.id) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {sp.naam}
                </button>
              ))}
            </div>
            {selectedSpelers.length > 0 && (
              <button onClick={() => setSelectedSpelers([])} className="mt-2 text-xs text-blue-600 font-medium">Alles deselecteren</button>
            )}
          </div>

          {/* Chauffeurs per wedstrijd */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Aantal chauffeurs per wedstrijd</label>
            <input
              type="number"
              min={1}
              max={10}
              value={chauffeursPerWedstrijd}
              onChange={e => setChauffeursPerWedstrijd(parseInt(e.target.value) || 1)}
              className="w-24 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Wedstrijden */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Wedstrijden / datums</label>
            <div className="space-y-2">
              {wedstrijden.map((w, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={w.datum}
                    onChange={e => updateWedstrijd(idx, 'datum', e.target.value)}
                    placeholder="Za 05-09-2026"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={w.tijd}
                    onChange={e => updateWedstrijd(idx, 'tijd', e.target.value)}
                    placeholder="14:30"
                    className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={w.tegenstander}
                    onChange={e => updateWedstrijd(idx, 'tegenstander', e.target.value)}
                    placeholder="Tegenstander (optioneel)"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {wedstrijden.length > 1 && (
                    <button onClick={() => removeWedstrijd(idx)} className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addWedstrijd} className="mt-2 flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-800">
              <Plus className="w-3 h-3" />
              Wedstrijd toevoegen
            </button>
          </div>

          {/* Gemini key */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Gemini API-sleutel</label>
            <input
              type="password"
              value={geminiKey}
              onChange={e => setGeminiKey(e.target.value)}
              placeholder="AI-sleutel (zelfde als bij betalingen scannen)"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {genError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {genError}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || selectedSpelers.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {generating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Genereren...</> : <><Sparkles className="w-4 h-4" /> Schema genereren</>}
          </button>

          {/* Generated result preview */}
          {genResult && (
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-bold text-gray-900">Gegenereerd schema</h3>
              <div className="space-y-2">
                {genResult.map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-blue-700">{item.datum}{item.tijd ? ` — ${item.tijd}` : ''}</p>
                    {item.wedstrijd && <p className="text-sm font-semibold text-gray-900">{item.wedstrijd}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {item.chauffeurs.map((c, j) => (
                        <span key={j} className="text-xs bg-blue-50 text-blue-800 font-medium px-2 py-0.5 rounded-lg">{c}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={schemaNaam}
                  onChange={e => setSchemaNaam(e.target.value)}
                  placeholder="Naam voor dit schema (bijv. Seizoen 2026/2027)"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={saveSchema} disabled={!schemaNaam.trim()} className="bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-60 transition-colors">
                  Opslaan
                </button>
                <button onClick={() => setGenResult(null)} className="bg-gray-100 text-gray-500 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition-colors">
                  Annuleren
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schema list (db view) */}
      {view === 'db' && (
        <div className="space-y-4">
          {schemas.length > 0 && (
            <div className="space-y-2">
              {schemas.map(s => (
                <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.actief ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <Car className={`w-4 h-4 ${s.actief ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{s.naam}</p>
                    <p className="text-xs text-gray-400">{items.filter(i => i.rijschema_id === s.id).length} wedstrijden</p>
                  </div>
                  {isBeheerder && (
                    <>
                      {!s.actief && (
                        <button onClick={() => setActiveSchema(s.id)} className="text-xs text-blue-600 font-medium hover:text-blue-800">
                          Activeren
                        </button>
                      )}
                      {s.actief && <span className="text-xs text-green-600 font-semibold">Actief</span>}
                      <button onClick={() => deleteSchema(s.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeSchema && activeItems.length > 0 ? (
            <div className="space-y-3">
              {activeItems.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Car className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-blue-700">{item.datum}{item.tijd ? ` — ${item.tijd}` : ''}</p>
                      {!item.is_fiets && item.wedstrijd && <p className="text-sm font-semibold text-gray-900 truncate">{item.wedstrijd}</p>}
                    </div>
                  </div>
                  <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    {item.is_fiets ? (
                      <span className="text-sm text-green-700 font-semibold">Fiets</span>
                    ) : item.chauffeurs.map((c, j) => (
                      <span key={j} className="text-sm bg-blue-50 text-blue-800 font-medium px-2.5 py-1 rounded-lg">{c}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : schemas.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <Car className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nog geen gegenereerd rijschema. Klik op "Nieuw schema" om er een te maken.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <p className="text-sm text-gray-400">Geen rijschema actief. Selecteer een schema hierboven of genereer een nieuwe.</p>
            </div>
          )}
        </div>
      )}

      {/* Static view */}
      {view === 'static' && (
        <div className="space-y-3">
          {STATIC_RIJSCHEMA.map((item, i) => {
            const isFiets = item.isFiets ?? false;
            return (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Car className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-blue-700">{item.datum} — {item.tijd}</p>
                    {!isFiets && <p className="text-sm font-semibold text-gray-900 truncate">{item.wedstrijd}</p>}
                  </div>
                </div>
                <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  {isFiets ? (
                    <span className="text-sm text-green-700 font-semibold">Fiets</span>
                  ) : item.chauffeurs.map((c, j) => (
                    <span key={j} className="text-sm bg-blue-50 text-blue-800 font-medium px-2.5 py-1 rounded-lg">{c}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
