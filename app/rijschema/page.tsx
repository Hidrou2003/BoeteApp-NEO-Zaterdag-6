'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Speler, Boetecategorie, Rijschema, RijschemaItem, GEMINI_PREFIX, extractGeminiKey } from '@/lib/supabase';
import { Car, MapPin, Plus, Trash2, Check, X, Sparkles, RefreshCw, AlertCircle, Pencil, ChevronLeft, ChevronRight, Calendar, Hand } from 'lucide-react';

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
  const [categorieen, setCategorieen] = useState<Boetecategorie[]>([]);
  const [schemas, setSchemas] = useState<Rijschema[]>([]);
  const [items, setItems] = useState<RijschemaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);

  // Generator state
  const [selectedSpelers, setSelectedSpelers] = useState<string[]>([]);
  const [wedstrijden, setWedstrijden] = useState<WedstrijdInput[]>([{ datum: '', tijd: '', tegenstander: '' }]);
  const [chauffeursPerWedstrijd, setChauffeursPerWedstrijd] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genResult, setGenResult] = useState<RijschemaItem[] | null>(null);
  const [schemaNaam, setSchemaNaam] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date());

  // Edit state for existing schemas
  const [editingSchemaId, setEditingSchemaId] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<RijschemaItem[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: sps }, { data: cats }, { data: sch }, { data: its }] = await Promise.all([
      supabase.from('spelers').select('*').eq('actief', true).order('naam'),
      supabase.from('boetecategorieen').select('*').order('volgorde'),
      supabase.from('rij schemas').select('*').order('created_at', { ascending: false }),
      supabase.from('rijschema_items').select('*').order('volgorde'),
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

  function updateWedstrijd(idx: number, field: keyof WedstrijdInput, value: string) {
    setWedstrijden(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  }

  function addWedstrijd() {
    setWedstrijden(prev => [...prev, { datum: '', tijd: '', tegenstander: '' }]);
  }

  function removeWedstrijd(idx: number) {
    setWedstrijden(prev => prev.filter((_, i) => i !== idx));
  }

  function addDateFromCalendar(dateStr: string) {
    setWedstrijden(prev => [...prev, { datum: dateStr, tijd: '', tegenstander: '' }]);
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

  function startManualSchema() {
    const entries: RijschemaItem[] = wedstrijden
      .filter(w => w.datum.trim())
      .map((w, i) => ({
        id: `temp-${i}`,
        rijschema_id: 'temp',
        datum: w.datum,
        tijd: w.tijd || null,
        wedstrijd: w.tegenstander || null,
        chauffeurs: [],
        is_fiets: false,
        volgorde: i,
        created_at: '',
      }));
    if (entries.length === 0) {
      setGenError('Voeg minimaal één wedstrijd met een datum toe.');
      return;
    }
    setGenError('');
    setGenResult(entries);
  }

  function toggleChauffeurInResult(itemIdx: number, spelerNaam: string) {
    if (!genResult) return;
    setGenResult(prev => (prev ?? []).map((item, i) => {
      if (i !== itemIdx) return item;
      const has = item.chauffeurs.includes(spelerNaam);
      return {
        ...item,
        chauffeurs: has ? item.chauffeurs.filter(c => c !== spelerNaam) : [...item.chauffeurs, spelerNaam],
      };
    }));
  }

  function updateResultField(itemIdx: number, field: keyof RijschemaItem, value: any) {
    if (!genResult) return;
    setGenResult(prev => (prev ?? []).map((item, i) => i === itemIdx ? { ...item, [field]: value } : item));
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
    setManualMode(false);
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

  function startEdit(schemaId: string) {
    const schemaItems = items.filter(i => i.rijschema_id === schemaId).sort((a, b) => a.volgorde - b.volgorde);
    setEditItems(schemaItems.map(i => ({ ...i })));
    setEditingSchemaId(schemaId);
  }

  function toggleChauffeurInEdit(itemIdx: number, spelerNaam: string) {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== itemIdx) return item;
      const has = item.chauffeurs.includes(spelerNaam);
      return {
        ...item,
        chauffeurs: has ? item.chauffeurs.filter(c => c !== spelerNaam) : [...item.chauffeurs, spelerNaam],
      };
    }));
  }

  function updateEditField(itemIdx: number, field: keyof RijschemaItem, value: any) {
    setEditItems(prev => prev.map((item, i) => i === itemIdx ? { ...item, [field]: value } : item));
  }

  async function saveEdit() {
    if (!editingSchemaId) return;
    for (const item of editItems) {
      await supabase.from('rijschema_items').update({
        datum: item.datum,
        tijd: item.tijd,
        wedstrijd: item.wedstrijd,
        chauffeurs: item.chauffeurs,
        is_fiets: item.is_fiets,
      }).eq('id', item.id);
    }
    setEditingSchemaId(null);
    setEditItems([]);
    load();
  }

  const activeSchema = schemas.find(s => s.actief);
  const activeItems = items.filter(i => i.rijschema_id === activeSchema?.id).sort((a, b) => a.volgorde - b.volgorde);

  // Calendar helpers
  const calYear = calMonth.getFullYear();
  const calMonthIdx = calMonth.getMonth();
  const firstDay = new Date(calYear, calMonthIdx, 1);
  const lastDay = new Date(calYear, calMonthIdx + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const monthName = calMonth.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

  function formatDateStr(d: Date): string {
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const dayName = d.toLocaleDateString('nl-NL', { weekday: 'short' });
    return `${dayName} ${day}-${month}-${year}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rijschema</h1>
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
              <h2 className="text-base font-bold text-gray-900">Nieuw rijschema</h2>
            </div>
            {/* AI / Manual toggle */}
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

          {/* Wedstrijden / datums */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Wedstrijden / datums</label>
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-800"
              >
                <Calendar className="w-3.5 h-3.5" />
                {showCalendar ? 'Agenda sluiten' : 'Agenda openen'}
              </button>
            </div>

            {/* Calendar */}
            {showCalendar && (
              <div className="bg-gray-50 rounded-xl p-4 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setCalMonth(new Date(calYear, calMonthIdx - 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-200">
                    <ChevronLeft className="w-4 h-4 text-gray-500" />
                  </button>
                  <span className="text-sm font-semibold text-gray-700 capitalize">{monthName}</span>
                  <button onClick={() => setCalMonth(new Date(calYear, calMonthIdx + 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-200">
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(d => (
                    <div key={d} className="text-xs font-semibold text-gray-400 py-1">{d}</div>
                  ))}
                  {Array.from({ length: startOffset }, (_, i) => <div key={`empty-${i}`} />)}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const dayNum = i + 1;
                    const date = new Date(calYear, calMonthIdx, dayNum);
                    const dateStr = formatDateStr(date);
                    const isSelected = wedstrijden.some(w => w.datum === dateStr);
                    return (
                      <button
                        key={dayNum}
                        onClick={() => addDateFromCalendar(dateStr)}
                        className={`aspect-square rounded-lg text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600 border border-gray-200'
                        }`}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">Klik op een datum om een wedstrijd toe te voegen.</p>
              </div>
            )}

            {/* Wedstrijd list */}
            <div className="space-y-2">
              {wedstrijden.map((w, idx) => (
                <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={w.datum}
                    onChange={e => updateWedstrijd(idx, 'datum', e.target.value)}
                    placeholder="Za 05-09-2026"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={w.tijd}
                      onChange={e => updateWedstrijd(idx, 'tijd', e.target.value)}
                      placeholder="14:30"
                      className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={w.tegenstander}
                      onChange={e => updateWedstrijd(idx, 'tegenstander', e.target.value)}
                      placeholder="Tegenstander (optioneel)"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                    />
                    {wedstrijden.length > 1 && (
                      <button onClick={() => removeWedstrijd(idx)} className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addWedstrijd} className="mt-2 flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-800">
              <Plus className="w-3 h-3" />
              Wedstrijd toevoegen
            </button>
          </div>

          {genError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {genError}
            </div>
          )}

          {/* Generate or Manual button */}
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

          {/* Generated/Manual result preview */}
          {genResult && (
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-bold text-gray-900">{manualMode ? 'Handmatig schema' : 'Gegenereerd schema'}</h3>
              <p className="text-xs text-gray-400">{manualMode ? 'Vink per wedstrijd de chauffeurs aan.' : 'Pas aan wat je wilt voordat je opslaat.'}</p>
              <div className="space-y-2">
                {genResult.map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="flex flex-col gap-1.5 sm:flex-row">
                      <input
                        type="text"
                        value={item.datum}
                        onChange={e => updateResultField(i, 'datum', e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                      />
                      <input
                        type="text"
                        value={item.tijd ?? ''}
                        onChange={e => updateResultField(i, 'tijd', e.target.value)}
                        placeholder="Tijd"
                        className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                      />
                      <input
                        type="text"
                        value={item.wedstrijd ?? ''}
                        onChange={e => updateResultField(i, 'wedstrijd', e.target.value)}
                        placeholder="Wedstrijd"
                        className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                      />
                    </div>
                    {/* Chauffeur selection */}
                    <div className="flex flex-wrap gap-1.5">
                      {spelers.filter(s => selectedSpelers.includes(s.id)).map(sp => {
                        const selected = item.chauffeurs.includes(sp.naam);
                        return (
                          <button
                            key={sp.id}
                            onClick={() => toggleChauffeurInResult(i, sp.naam)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${selected ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-blue-50'}`}
                          >
                            {sp.naam}
                          </button>
                        );
                      })}
                      {item.chauffeurs.filter(c => !spelers.some(s => s.naam === c)).map((c, j) => (
                        <span key={`extra-${j}`} className="text-xs bg-blue-50 text-blue-800 font-medium px-2 py-1 rounded-lg">{c}</span>
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
                    value={item.datum}
                    onChange={e => updateEditField(i, 'datum', e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                  />
                  <input
                    type="text"
                    value={item.tijd ?? ''}
                    onChange={e => updateEditField(i, 'tijd', e.target.value)}
                    placeholder="Tijd"
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                  />
                  <input
                    type="text"
                    value={item.wedstrijd ?? ''}
                    onChange={e => updateEditField(i, 'wedstrijd', e.target.value)}
                    placeholder="Wedstrijd"
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {spelers.map(sp => {
                    const selected = item.chauffeurs.includes(sp.naam);
                    return (
                      <button
                        key={sp.id}
                        onClick={() => toggleChauffeurInEdit(i, sp.naam)}
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
            <p className="text-sm text-gray-400">Nog geen rijschema. Klik op "Nieuw schema" om er een te maken.</p>
          </div>
        ) : !editingSchemaId ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-sm text-gray-400">Geen rijschema actief. Selecteer een schema hierboven of maak een nieuwe.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
