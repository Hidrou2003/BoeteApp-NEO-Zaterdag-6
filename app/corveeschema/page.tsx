'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Speler, Corveeschema, CorveeschemaItem } from '@/lib/supabase';
import { Sparkles, Plus, Trash2, X, RefreshCw, AlertCircle, Users } from 'lucide-react';
import { getISOWeek, getISOWeekYear, format } from 'date-fns';
import { nl } from 'date-fns/locale';

const STATIC_NAJAAR = [
  { week: 36, namen: ['Guus', 'Haye', 'Hidde G'] },
  { week: 37, namen: ['Hidde R', 'Joep', 'Jorn'] },
  { week: 38, namen: ['Julian', 'Lucas', 'Max B'] },
  { week: 39, namen: ['Max N', 'Nick', 'Niek'] },
  { week: 40, namen: ['Rick', 'Thomas', 'Thijmen'] },
  { week: 41, namen: ['Tim', 'Bjorn', 'Emiel'] },
  { week: 42, namen: ['Ewen', 'Guus', 'Haye'] },
  { week: 43, namen: ['Hidde G', 'Hidde R', 'Joep'] },
  { week: 44, namen: ['Jorn', 'Julian', 'Lucas'] },
  { week: 45, namen: ['Max B', 'Max N', 'Nick'] },
  { week: 46, namen: ['Niek', 'Rick', 'Thomas'] },
  { week: 47, namen: ['Thijmen', 'Tim', 'Bjorn'] },
  { week: 48, namen: ['Emiel', 'Ewen', 'Guus'] },
  { week: 49, namen: ['Haye', 'Hidde G', 'Hidde R'], winterstop: true },
];

const STATIC_VOORJAAR = [
  { week: 3, namen: ['Joep', 'Jorn', 'Julian'] },
  { week: 4, namen: ['Lucas', 'Max B', 'Max N'] },
  { week: 5, namen: ['Nick', 'Niek', 'Rick'] },
  { week: 6, namen: ['Thomas', 'Thijmen', 'Tim'] },
  { week: 7, namen: ['Bjorn', 'Emiel', 'Ewen'] },
  { week: 8, namen: ['Guus', 'Haye', 'Hidde G'] },
  { week: 9, namen: ['Hidde R', 'Joep', 'Jorn'] },
  { week: 10, namen: ['Julian', 'Lucas', 'Max B'] },
  { week: 11, namen: ['Max N', 'Nick', 'Niek'] },
  { week: 12, namen: ['Rick', 'Thomas', 'Thijmen'] },
  { week: 13, namen: ['Tim', 'Bjorn', 'Emiel'] },
  { week: 14, namen: ['Ewen', 'Guus', 'Haye'] },
  { week: 15, namen: ['Hidde G', 'Hidde R', 'Joep'] },
  { week: 16, namen: ['Jorn', 'Julian', 'Lucas'] },
  { week: 17, namen: ['Max B', 'Max N', 'Nick'] },
  { week: 18, namen: ['Niek', 'Rick', 'Thomas'] },
  { week: 19, namen: ['Thijmen', 'Tim', 'Bjorn'] },
  { week: 20, namen: ['Emiel', 'Ewen', 'Guus'] },
];

interface PeriodeInput {
  start: string;
  eind: string;
  isBreak: boolean;
}

export default function CorveeschemaPage() {
  return (
    <AuthGuard>
      <AppShell>
        <CorveeschemaContent />
      </AppShell>
    </AuthGuard>
  );
}

function CorveeschemaContent() {
  const { profile } = useAuth();
  const isBeheerder = profile?.rol === 'beheerder' || profile?.rol === 'hoofdbeheerder';

  const [spelers, setSpelers] = useState<Speler[]>([]);
  const [schemas, setSchemas] = useState<Corveeschema[]>([]);
  const [items, setItems] = useState<CorveeschemaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  const [view, setView] = useState<'static' | 'db'>('static');

  // Generator state
  const [selectedSpelers, setSelectedSpelers] = useState<string[]>([]);
  const [periodes, setPeriodes] = useState<PeriodeInput[]>([{ start: '', eind: '', isBreak: false }]);
  const [interval, setInterval] = useState('per week');
  const [spelersPerKeer, setSpelersPerKeer] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genResult, setGenResult] = useState<CorveeschemaItem[] | null>(null);
  const [schemaNaam, setSchemaNaam] = useState('');
  const [geminiKey, setGeminiKey] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: sps }, { data: sch }, { data: its }] = await Promise.all([
      supabase.from('spelers').select('*').eq('actief', true).order('naam'),
      supabase.from('corvee schemas').select('*').order('created_at', { ascending: false }),
      supabase.from('corveeschema_items').select('*').order('volgorde'),
    ]);
    setSpelers(sps ?? []);
    setSchemas(sch ?? []);
    setItems(its ?? []);
    setLoading(false);
  }

  function toggleSpeler(id: string) {
    setSelectedSpelers(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function updatePeriode(idx: number, field: keyof PeriodeInput, value: string | boolean) {
    setPeriodes(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  function addPeriode() {
    setPeriodes(prev => [...prev, { start: '', eind: '', isBreak: false }]);
  }

  function removePeriode(idx: number) {
    setPeriodes(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    setGenResult(null);

    const spelerNamen = spelers.filter(s => selectedSpelers.includes(s.id)).map(s => s.naam);
    const pData = periodes.filter(p => p.start.trim() || p.eind.trim()).map(p => ({
      start: p.start,
      eind: p.eind,
      is_break: p.isBreak,
    }));

    if (spelerNamen.length < spelersPerKeer) {
      setGenError(`Je hebt ${spelerNamen.length} spelers geselecteerd maar ${spelersPerKeer} per corveebeurt nodig.`);
      setGenerating(false);
      return;
    }

    if (pData.length === 0) {
      setGenError('Voeg minimaal één periode toe.');
      setGenerating(false);
      return;
    }

    try {
      const resp = await fetch('/api/gen-corveeschema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiKey, spelers: spelerNamen, periodes: pData, interval, spelersPerKeer }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setGenError(data.error || 'Genereren mislukt');
        setGenerating(false);
        return;
      }
      const entries: CorveeschemaItem[] = data.entries.map((e: any, i: number) => ({
        id: `temp-${i}`,
        corveeschema_id: 'temp',
        label: e.label,
        datum_start: e.datum_start,
        datum_eind: e.datum_eind,
        namen: e.namen || [],
        is_break: e.is_break || false,
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
    const { data: newSchema, error } = await supabase.from('corvee schemas').insert({
      naam: schemaNaam.trim(),
      seizoen: schemaNaam.trim(),
    }).select().single();

    if (error || !newSchema) return;

    const itemsToInsert = genResult.map((item, i) => ({
      corveeschema_id: newSchema.id,
      label: item.label,
      datum_start: item.datum_start,
      datum_eind: item.datum_eind,
      namen: item.namen,
      is_break: item.is_break,
      volgorde: i,
    }));

    await supabase.from('corveeschema_items').insert(itemsToInsert);

    setGenResult(null);
    setSchemaNaam('');
    setShowGenerator(false);
    setPeriodes([{ start: '', eind: '', isBreak: false }]);
    setSelectedSpelers([]);
    load();
  }

  async function setActiveSchema(id: string) {
    await supabase.from('corvee schemas').update({ actief: false }).neq('id', id);
    await supabase.from('corvee schemas').update({ actief: true }).eq('id', id);
    load();
  }

  async function deleteSchema(id: string) {
    await supabase.from('corvee schemas').delete().eq('id', id);
    load();
  }

  const activeSchema = schemas.find(s => s.actief);
  const activeItems = items.filter(i => i.corveeschema_id === activeSchema?.id);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Corveeschema</h1>
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
            <h2 className="text-base font-bold text-gray-900">Nieuw corveeschema genereren</h2>
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

          {/* Periodes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Trainingsperiodes (met pauzes)</label>
            <div className="space-y-2">
              {periodes.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={p.start}
                    onChange={e => updatePeriode(idx, 'start', e.target.value)}
                    placeholder="Start (DD-MM-YYYY)"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-400 text-xs">t/m</span>
                  <input
                    type="text"
                    value={p.eind}
                    onChange={e => updatePeriode(idx, 'eind', e.target.value)}
                    placeholder="Eind (DD-MM-YYYY)"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => updatePeriode(idx, 'isBreak', !p.isBreak)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${p.isBreak ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {p.isBreak ? 'Pauze' : 'Normaal'}
                  </button>
                  {periodes.length > 1 && (
                    <button onClick={() => removePeriode(idx)} className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addPeriode} className="mt-2 flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-800">
              <Plus className="w-3 h-3" />
              Periode toevoegen
            </button>
          </div>

          {/* Interval */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Interval</label>
            <select
              value={interval}
              onChange={e => setInterval(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="per training/wedstrijd">Per training/wedstrijd</option>
              <option value="per week">Per week</option>
              <option value="per twee weken">Per twee weken</option>
              <option value="per maand">Per maand</option>
            </select>
          </div>

          {/* Spelers per keer */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Aantal spelers per corveebeurt</label>
            <input
              type="number"
              min={1}
              max={10}
              value={spelersPerKeer}
              onChange={e => setSpelersPerKeer(parseInt(e.target.value) || 1)}
              className="w-24 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-500 uppercase">{item.label}</p>
                      {item.is_break && <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded">Pauze</span>}
                    </div>
                    {item.datum_start && <p className="text-xs text-gray-400">{item.datum_start}{item.datum_eind ? ` t/m ${item.datum_eind}` : ''}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {item.namen.map((n, j) => (
                        <span key={j} className="text-xs bg-blue-50 text-blue-800 font-medium px-2 py-0.5 rounded-lg">{n}</span>
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
                  placeholder="Naam voor dit schema"
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

      {/* DB view */}
      {view === 'db' && (
        <div className="space-y-4">
          {schemas.length > 0 && (
            <div className="space-y-2">
              {schemas.map(s => (
                <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.actief ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <Sparkles className={`w-4 h-4 ${s.actief ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{s.naam}</p>
                    <p className="text-xs text-gray-400">{items.filter(i => i.corveeschema_id === s.id).length} corveebeurten</p>
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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {activeItems.map((item, i) => (
                <div key={item.id}>
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="w-20 flex-shrink-0">
                      <p className="text-xs font-semibold text-gray-400 uppercase">{item.label}</p>
                      {item.datum_start && <p className="text-[11px] text-gray-400 leading-tight">{item.datum_start}{item.datum_eind ? ` t/m ${item.datum_eind}` : ''}</p>}
                    </div>
                    <div className="flex-1 flex flex-wrap gap-1.5">
                      {item.namen.map((naam, j) => (
                        <span key={j} className="text-sm bg-blue-50 text-blue-800 font-medium px-2.5 py-1 rounded-lg">{naam}</span>
                      ))}
                    </div>
                    {item.is_break && (
                      <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-lg flex-shrink-0">Pauze</span>
                    )}
                  </div>
                  {i < activeItems.length - 1 && <div className="h-px bg-gray-50 mx-4" />}
                </div>
              ))}
            </div>
          ) : schemas.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nog geen gegenereerd corveeschema. Klik op "Nieuw schema" om er een te maken.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <p className="text-sm text-gray-400">Geen corveeschema actief. Selecteer een schema hierboven of genereer een nieuwe.</p>
            </div>
          )}
        </div>
      )}

      {/* Static view */}
      {view === 'static' && (
        <div className="space-y-6">
          <SeizoenSection title="Najaar 2026" year={2026} weken={STATIC_NAJAAR} />
          <SeizoenSection title="Voorjaar 2027" year={2027} weken={STATIC_VOORJAAR} />
        </div>
      )}
    </div>
  );
}

function weekDateRange(year: number, weekNr: number): string {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay();
  const isoWeek1Monday = new Date(jan4);
  isoWeek1Monday.setDate(jan4.getDate() - ((jan4Day + 6) % 7));
  const weekMonday = new Date(isoWeek1Monday);
  weekMonday.setDate(isoWeek1Monday.getDate() + (weekNr - 1) * 7);
  const sunday = new Date(weekMonday);
  sunday.setDate(weekMonday.getDate() + 6);
  return `${format(weekMonday, 'dd MMM yyyy', { locale: nl })} t/m ${format(sunday, 'dd MMM yyyy', { locale: nl })}`;
}

function SeizoenSection({ title, year, weken }: { title: string; year: number; weken: { week: number; namen: string[]; winterstop?: boolean }[] }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {weken.map((item, i) => (
          <div key={item.week}>
            <div className="flex items-center gap-4 px-4 py-3">
              <div className="w-20 flex-shrink-0">
                <p className="text-xs font-semibold text-gray-400 uppercase">Week {item.week}</p>
                <p className="text-[11px] text-gray-400 leading-tight">{weekDateRange(year, item.week)}</p>
              </div>
              <div className="flex-1 flex flex-wrap gap-1.5">
                {item.namen.map((naam, j) => (
                  <span key={j} className="text-sm bg-blue-50 text-blue-800 font-medium px-2.5 py-1 rounded-lg">{naam}</span>
                ))}
              </div>
              {item.winterstop && (
                <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-lg flex-shrink-0">Winterstop</span>
              )}
            </div>
            {i < weken.length - 1 && <div className="h-px bg-gray-50 mx-4" />}
          </div>
        ))}
      </div>
    </section>
  );
}
