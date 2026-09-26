'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Speler, Boetecategorie, Corveeschema, CorveeschemaItem, GEMINI_PREFIX, extractGeminiKey } from '@/lib/supabase';
import { Sparkles, Plus, Trash2, X, RefreshCw, AlertCircle, Pencil, Hand } from 'lucide-react';

interface PeriodeInput {
  start: string;
  eind: string;
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
  const [categorieen, setCategorieen] = useState<Boetecategorie[]>([]);
  const [schemas, setSchemas] = useState<Corveeschema[]>([]);
  const [items, setItems] = useState<CorveeschemaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);

  // Generator state
  const [selectedSpelers, setSelectedSpelers] = useState<string[]>([]);
  const [periodes, setPeriodes] = useState<PeriodeInput[]>([{ start: '', eind: '' }]);
  const [interval, setIntervalType] = useState('per week');
  const [spelersPerKeer, setSpelersPerKeer] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genResult, setGenResult] = useState<CorveeschemaItem[] | null>(null);
  const [schemaNaam, setSchemaNaam] = useState('');
  const [manualMode, setManualMode] = useState(false);

  // Edit state
  const [editingSchemaId, setEditingSchemaId] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<CorveeschemaItem[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: sps }, { data: cats }, { data: sch }, { data: its }] = await Promise.all([
      supabase.from('spelers').select('*').eq('actief', true).order('naam'),
      supabase.from('boetecategorieen').select('*').order('volgorde'),
      supabase.from('corvee schemas').select('*').order('created_at', { ascending: false }),
      supabase.from('corveeschema_items').select('*').order('volgorde'),
    ]);
    setSpelers(sps ?? []);
    setCategorieen(cats ?? []);
    setSchemas(sch ?? []);
    setItems(its ?? []);
    setLoading(false);
  }

  const geminiKey = extractGeminiKey(categorieen);

  function toggleSpeler(id: string) {
    setSelectedSpelers(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function updatePeriode(idx: number, field: keyof PeriodeInput, value: string) {
    setPeriodes(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  function addPeriode() {
    setPeriodes(prev => [...prev, { start: '', eind: '' }]);
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

  function startManualSchema() {
    const entries: CorveeschemaItem[] = periodes
      .filter(p => p.start.trim() || p.eind.trim())
      .map((p, i) => ({
        id: `temp-${i}`,
        corveeschema_id: 'temp',
        label: `Periode ${i + 1}`,
        datum_start: p.start || null,
        datum_eind: p.eind || null,
        namen: [],
        is_break: false,
        volgorde: i,
        created_at: '',
      }));
    if (entries.length === 0) {
      setGenError('Voeg minimaal één periode toe.');
      return;
    }
    setGenError('');
    setGenResult(entries);
  }

  function toggleNaamInResult(itemIdx: number, spelerNaam: string) {
    if (!genResult) return;
    setGenResult(prev => (prev ?? []).map((item, i) => {
      if (i !== itemIdx) return item;
      const has = item.namen.includes(spelerNaam);
      return {
        ...item,
        namen: has ? item.namen.filter(n => n !== spelerNaam) : [...item.namen, spelerNaam],
      };
    }));
  }

  function updateResultField(itemIdx: number, field: keyof CorveeschemaItem, value: any) {
    if (!genResult) return;
    setGenResult(prev => (prev ?? []).map((item, i) => i === itemIdx ? { ...item, [field]: value } : item));
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
    setManualMode(false);
    setPeriodes([{ start: '', eind: '' }]);
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

  function startEdit(schemaId: string) {
    const schemaItems = items.filter(i => i.corveeschema_id === schemaId).sort((a, b) => a.volgorde - b.volgorde);
    setEditItems(schemaItems.map(i => ({ ...i })));
    setEditingSchemaId(schemaId);
  }

  function toggleNaamInEdit(itemIdx: number, spelerNaam: string) {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== itemIdx) return item;
      const has = item.namen.includes(spelerNaam);
      return {
        ...item,
        namen: has ? item.namen.filter(n => n !== spelerNaam) : [...item.namen, spelerNaam],
      };
    }));
  }

  function updateEditField(itemIdx: number, field: keyof CorveeschemaItem, value: any) {
    setEditItems(prev => prev.map((item, i) => i === itemIdx ? { ...item, [field]: value } : item));
  }

  async function saveEdit() {
    if (!editingSchemaId) return;
    for (const item of editItems) {
      await supabase.from('corveeschema_items').update({
        label: item.label,
        datum_start: item.datum_start,
        datum_eind: item.datum_eind,
        namen: item.namen,
        is_break: item.is_break,
      }).eq('id', item.id);
    }
    setEditingSchemaId(null);
    setEditItems([]);
    load();
  }

  const activeSchema = schemas.find(s => s.actief);
  const activeItems = items.filter(i => i.corveeschema_id === activeSchema?.id).sort((a, b) => a.volgorde - b.volgorde);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Corveeschema</h1>
          <p className="text-sm text-gray-500">NEO Zaterdag 6 — Seizoen 2026/2027</p>
        </div>
        {isBeheerder && (
          <button
            onClick={() => { setShowGenerator(!showGenerator); setGenResult(null); setGenError(''); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            {showGenerator ? 'Sluiten' : 'Nieuw schema'}
          </button>
        )}
      </div>

      {/* Generator */}
      {showGenerator && isBeheerder && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-gray-900">Nieuw corveeschema</h2>
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setManualMode(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${!manualMode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
              >
                <Sparkles className="w-3 h-3 inline mr-1" />AI
              </button>
              <button
                onClick={() => setManualMode(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${manualMode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
              >
                <Hand className="w-3 h-3 inline mr-1" />Handmatig
              </button>
            </div>
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Trainingsperiodes</label>
            <div className="space-y-2">
              {periodes.map((p, idx) => (
                <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={p.start}
                    onChange={e => updatePeriode(idx, 'start', e.target.value)}
                    placeholder="Start (DD-MM-YYYY)"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                  />
                  <span className="text-gray-400 text-xs text-center sm:py-2">t/m</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={p.eind}
                      onChange={e => updatePeriode(idx, 'eind', e.target.value)}
                      placeholder="Eind (DD-MM-YYYY)"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                    />
                    {periodes.length > 1 && (
                      <button onClick={() => removePeriode(idx)} className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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
              onChange={e => setIntervalType(e.target.value)}
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

          {genError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {genError}
            </div>
          )}

          {!genResult && (
            <div className="flex gap-2">
              <button
                onClick={() => { setShowGenerator(false); setGenResult(null); setGenError(''); }}
                className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-4 py-3.5 rounded-xl transition-colors text-sm border border-red-200"
              >
                <X className="w-4 h-4" />
                Annuleren
              </button>
              <button
                onClick={manualMode ? startManualSchema : handleGenerate}
                disabled={generating || (manualMode ? false : selectedSpelers.length === 0)}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                {generating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Genereren...</> : manualMode ? <><Hand className="w-4 h-4" /> Handmatig schema maken</> : <><Sparkles className="w-4 h-4" /> Schema genereren</>}
              </button>
            </div>
          )}

          {/* Result preview */}
          {genResult && (
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-bold text-gray-900">{manualMode ? 'Handmatig schema' : 'Gegenereerd schema'}</h3>
              <p className="text-xs text-gray-400">{manualMode ? 'Vink per periode de spelers aan.' : 'Pas aan wat je wilt voordat je opslaat.'}</p>
              <div className="space-y-2">
                {genResult.map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="flex flex-col gap-1.5 sm:flex-row">
                      <input
                        type="text"
                        value={item.label}
                        onChange={e => updateResultField(i, 'label', e.target.value)}
                        placeholder="Label"
                        className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                      />
                      <input
                        type="text"
                        value={item.datum_start ?? ''}
                        onChange={e => updateResultField(i, 'datum_start', e.target.value)}
                        placeholder="Start"
                        className="w-28 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                      />
                      <input
                        type="text"
                        value={item.datum_eind ?? ''}
                        onChange={e => updateResultField(i, 'datum_eind', e.target.value)}
                        placeholder="Eind"
                        className="w-28 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {spelers.filter(s => selectedSpelers.includes(s.id)).map(sp => {
                        const selected = item.namen.includes(sp.naam);
                        return (
                          <button
                            key={sp.id}
                            onClick={() => toggleNaamInResult(i, sp.naam)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${selected ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-blue-50'}`}
                          >
                            {sp.naam}
                          </button>
                        );
                      })}
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
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                />
                <button onClick={saveSchema} disabled={!schemaNaam.trim()} className="bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-60 transition-colors whitespace-nowrap">
                  Opslaan
                </button>
                <button onClick={() => setGenResult(null)} className="bg-gray-100 text-gray-500 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition-colors whitespace-nowrap">
                  Annuleren
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schema list */}
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
                    <button onClick={() => startEdit(s.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteSchema(s.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Edit mode */}
        {editingSchemaId && editItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Schema bewerken</h3>
              <div className="flex gap-2">
                <button onClick={saveEdit} className="bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition-colors">
                  Opslaan
                </button>
                <button onClick={() => { setEditingSchemaId(null); setEditItems([]); }} className="bg-gray-100 text-gray-500 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition-colors">
                  Annuleren
                </button>
              </div>
            </div>
            {editItems.map((item, i) => (
              <div key={item.id} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="flex flex-col gap-1.5 sm:flex-row">
                  <input
                    type="text"
                    value={item.label}
                    onChange={e => updateEditField(i, 'label', e.target.value)}
                    placeholder="Label"
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                  />
                  <input
                    type="text"
                    value={item.datum_start ?? ''}
                    onChange={e => updateEditField(i, 'datum_start', e.target.value)}
                    placeholder="Start"
                    className="w-28 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                  />
                  <input
                    type="text"
                    value={item.datum_eind ?? ''}
                    onChange={e => updateEditField(i, 'datum_eind', e.target.value)}
                    placeholder="Eind"
                    className="w-28 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {spelers.map(sp => {
                    const selected = item.namen.includes(sp.naam);
                    return (
                      <button
                        key={sp.id}
                        onClick={() => toggleNaamInEdit(i, sp.naam)}
                        className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${selected ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-blue-50'}`}
                      >
                        {sp.naam}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Active schema display */}
        {activeSchema && activeItems.length > 0 && !editingSchemaId ? (
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
                </div>
                {i < activeItems.length - 1 && <div className="h-px bg-gray-50 mx-4" />}
              </div>
            ))}
          </div>
        ) : schemas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nog geen corveeschema. Klik op "Nieuw schema" om er een te maken.</p>
          </div>
        ) : !editingSchemaId ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-sm text-gray-400">Geen corveeschema actief. Selecteer een schema hierboven of maak een nieuwe.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
