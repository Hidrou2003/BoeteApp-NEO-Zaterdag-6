'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, AanwezigheidDatum, AanwezigheidEvenement, AanwezigheidResponse, AanwezigheidType, Speler } from '@/lib/supabase';
import { CalendarCheck, ChevronLeft, ChevronRight, Plus, Save, Trash2, Users, X, Clock, AlertTriangle, Check, Settings } from 'lucide-react';
import { addMonths, eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth, subMonths, subDays } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function AanwezigheidPage() {
  return (
    <AuthGuard>
      <AppShell>
        <AanwezigheidContent />
      </AppShell>
    </AuthGuard>
  );
}

function AanwezigheidContent() {
  const { profile } = useAuth();
  const isHoofdbeheerder = profile?.rol === 'hoofdbeheerder';
  const [evenementen, setEvenementen] = useState<AanwezigheidEvenement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [datums, setDatums] = useState<AanwezigheidDatum[]>([]);
  const [responses, setResponses] = useState<AanwezigheidResponse[]>([]);
  const [spelers, setSpelers] = useState<Speler[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);

  async function loadEvenementen() {
    setLoading(true);
    const [{ data: events }, { data: activeSpelers }] = await Promise.all([
      supabase.from('aanwezigheid_evenementen').select('*, aanwezigheid_types(*)').order('deadline', { ascending: false }),
      supabase.from('spelers').select('*').eq('actief', true).order('naam'),
    ]);
    const nextEvents = (events ?? []) as AanwezigheidEvenement[];
    setEvenementen(nextEvents);
    setSpelers((activeSpelers ?? []) as Speler[]);
    const nextId = selectedId && nextEvents.some(e => e.id === selectedId) ? selectedId : nextEvents[0]?.id ?? null;
    setSelectedId(nextId);
    if (nextId) await loadEventData(nextId);
    else { setDatums([]); setResponses([]); }
    setLoading(false);
  }

  async function loadEventData(eventId: string) {
    const [{ data: dates }, { data: responseRows }] = await Promise.all([
      supabase.from('aanwezigheid_datums').select('*').eq('evenement_id', eventId).order('datum'),
      supabase.from('aanwezigheid_responses').select('*, spelers(*)').eq('evenement_id', eventId),
    ]);
    setDatums((dates ?? []) as AanwezigheidDatum[]);
    setResponses((responseRows ?? []) as AanwezigheidResponse[]);
  }

  useEffect(() => { loadEvenementen(); }, []);

  async function selectEvent(id: string) {
    setSelectedId(id);
    await loadEventData(id);
  }

  async function handleDeleteEvent() {
    if (!selectedEvent || !window.confirm('Deze aanwezigheid en alle bijbehorende datums verwijderen?')) return;
    const { error } = await supabase.from('aanwezigheid_evenementen').delete().eq('id', selectedEvent.id);
    if (error) setMessage(error.message);
    else { setMessage('Aanwezigheid verwijderd.'); await loadEvenementen(); }
  }

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>;

  const selectedEvent = evenementen.find(event => event.id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Aanwezigheid</h1>
          <p className="text-sm text-gray-500">Reageer op geplande momenten vóór de deadline.</p>
        </div>
        {isHoofdbeheerder && (
          <div className="flex gap-2">
            <button onClick={() => setShowTypeModal(true)} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              <Settings className="h-4 w-4" />Standaarden
            </button>
            <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" />Nieuw
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>{message}</span>
          <button onClick={() => setMessage('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {showCreateModal && (
        <CreateEventModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => {
            setShowCreateModal(false);
            setMessage('Aanwezigheid aangemaakt.');
            loadEvenementen().then(() => selectEvent(id));
          }}
        />
      )}

      {showTypeModal && (
        <TypeManagementModal
          onClose={() => setShowTypeModal(false)}
          onSaved={() => { setShowTypeModal(false); setMessage('Standaarden opgeslagen.'); }}
        />
      )}

      {evenementen.length === 0 && !showCreateModal ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-14 text-center text-gray-400">
          <CalendarCheck className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p className="font-medium">Nog geen aanwezigheid aangemaakt</p>
          {isHoofdbeheerder && <p className="mt-1 text-sm">Maak een aanwezigheid aan om datums te plannen.</p>}
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {evenementen.map(event => (
              <button key={event.id} onClick={() => selectEvent(event.id)} className={`shrink-0 rounded-xl px-4 py-3 text-left transition-colors ${event.id === selectedId ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{event.naam}</p>
                  {event.aanwezigheid_types && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${event.id === selectedId ? 'bg-blue-500 text-blue-50' : 'bg-blue-50 text-blue-600'}`}>
                      {event.aanwezigheid_types.naam}
                    </span>
                  )}
                </div>
                <p className={`mt-0.5 text-xs ${event.id === selectedId ? 'text-blue-100' : 'text-gray-400'}`}>
                  {datums.length > 0 && datums[0]?.deadline ? `Deadline ${format(parseISO(datums[0].deadline), 'dd MMM HH:mm', { locale: nl })}` : ''}
                </p>
              </button>
            ))}
          </div>
          {selectedEvent && (
            <EventContent
              event={selectedEvent}
              datums={datums}
              responses={responses}
              spelers={spelers}
              isHoofdbeheerder={isHoofdbeheerder}
              onReload={() => loadEventData(selectedEvent.id)}
              onDelete={handleDeleteEvent}
            />
          )}
        </>
      )}
    </div>
  );
}

function computeDeadlineForDate(type: AanwezigheidType, dateStr: string): string {
  const ref = new Date(dateStr + 'T00:00:00');
  const deadlineDate = subDays(ref, type.deadline_dagen_voor);
  return format(deadlineDate, "yyyy-MM-dd") + 'T' + type.deadline_tijd;
}

function CreateEventModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { profile } = useAuth();
  const [types, setTypes] = useState<AanwezigheidType[]>([]);
  const [naam, setNaam] = useState('');
  const [typeId, setTypeId] = useState('');
  const [month, setMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dateDeadlines, setDateDeadlines] = useState<Record<string, string>>({});
  const [editingDeadlineFor, setEditingDeadlineFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('aanwezigheid_types').select('*').order('volgorde').then(({ data }) => {
      const t = (data ?? []) as AanwezigheidType[];
      setTypes(t);
      if (t[0]) setTypeId(t[0].id);
    });
  }, []);

  const selectedType = types.find(t => t.id === typeId) ?? null;

  useEffect(() => {
    if (selectedType) {
      const newDeadlines: Record<string, string> = {};
      for (const d of selectedDates) {
        newDeadlines[d] = computeDeadlineForDate(selectedType, d);
      }
      setDateDeadlines(newDeadlines);
    }
  }, [selectedType, selectedDates]);

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const leadingEmpty = (startOfMonth(month).getDay() + 6) % 7;

  function toggleDate(dateStr: string) {
    setSelectedDates(prev => {
      if (prev.includes(dateStr)) {
        const next = prev.filter(d => d !== dateStr);
        const dl = { ...dateDeadlines };
        delete dl[dateStr];
        setDateDeadlines(dl);
        return next;
      }
      return [...prev, dateStr].sort();
    });
  }

  function updateDeadline(dateStr: string, value: string) {
    setDateDeadlines(prev => ({ ...prev, [dateStr]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!naam.trim()) { setError('Vul een naam in.'); return; }
    if (selectedDates.length === 0) { setError('Selecteer minimaal één datum.'); return; }

    for (const d of selectedDates) {
      if (!dateDeadlines[d]) { setError(`Vul een deadline in voor ${format(parseISO(d), 'dd MMM', { locale: nl })}.`); return; }
      const parsed = new Date(dateDeadlines[d]);
      if (Number.isNaN(parsed.getTime())) { setError(`Ongeldige deadline voor ${format(parseISO(d), 'dd MMM', { locale: nl })}.`); return; }
    }

    setSaving(true);
    setError('');

    const firstDeadline = new Date(dateDeadlines[selectedDates[0]]).toISOString();

    const { data: eventData, error: eventError } = await supabase
      .from('aanwezigheid_evenementen')
      .insert({
        naam: naam.trim(),
        deadline: firstDeadline,
        type_id: typeId || null,
        created_by: profile!.id,
      })
      .select()
      .maybeSingle();

    if (eventError || !eventData) {
      setError(eventError?.message ?? 'Aanmaken mislukt.');
      setSaving(false);
      return;
    }

    const datumRows = selectedDates.map(d => ({
      evenement_id: eventData.id,
      datum: d,
      naam: naam.trim(),
      deadline: new Date(dateDeadlines[d]).toISOString(),
    }));

    const { error: datumError } = await supabase.from('aanwezigheid_datums').insert(datumRows);
    if (datumError) {
      setError(datumError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onCreated(eventData.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4 pb-0 sm:pb-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl z-10 max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl z-10">
          <div>
            <h2 className="text-base font-bold text-gray-900">Nieuwe aanwezigheid</h2>
            <p className="text-xs text-gray-400">Naam, type en datums instellen</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Naam</label>
            <input
              type="text"
              value={naam}
              onChange={e => setNaam(e.target.value)}
              placeholder="bijv. Training, Wedstrijd vs. Rivaal..."
              required
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">Alle geselecteerde datums krijgen deze naam.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type (deadline-standaard)</label>
            {types.length === 0 ? (
              <p className="text-xs text-gray-400">Nog geen standaarden aangemaakt. Ga naar "Standaarden" om er een toe te voegen.</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {types.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTypeId(t.id)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors border-2 ${
                      t.id === typeId ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {t.naam}
                  </button>
                ))}
              </div>
            )}
            {selectedType && (
              <p className="mt-1.5 text-xs text-gray-400">
                Deadline per datum: {selectedType.deadline_dagen_voor === 0 ? 'dezelfde dag' : `${selectedType.deadline_dagen_voor} dag(en) ervoor`} om {selectedType.deadline_tijd}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Datums ({selectedDates.length} geselecteerd)
            </label>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-gray-400">Klik op datums om toe te voegen of te verwijderen</span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setMonth(subMonths(month, 1))} className="rounded-lg p-1.5 hover:bg-gray-200"><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setMonth(addMonths(month, 1))} className="rounded-lg p-1.5 hover:bg-gray-200"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mb-2 text-center text-sm font-semibold capitalize text-gray-800">{format(month, 'MMMM yyyy', { locale: nl })}</div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-gray-400">
                {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(d => <span key={d} className="py-1">{d}</span>)}
                {Array.from({ length: leadingEmpty }).map((_, i) => <span key={`e${i}`} />)}
                {days.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const selected = selectedDates.includes(dateStr);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => toggleDate(dateStr)}
                      className={`relative rounded-lg py-2 text-xs transition-colors ${
                        selected ? 'bg-blue-600 text-white font-bold' : 'text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {selectedDates.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Deadlines per datum (aanpasbaar)</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedDates.map(d => (
                  <div key={d} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-gray-700 capitalize">{format(parseISO(d), 'EEEE d MMMM', { locale: nl })}</span>
                      <button type="button" onClick={() => toggleDate(d)} className="text-xs text-gray-400 hover:text-red-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editingDeadlineFor === d ? (
                      <div className="flex gap-2">
                        <input
                          type="datetime-local"
                          value={dateDeadlines[d] ?? ''}
                          onChange={e => updateDeadline(d, e.target.value)}
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button type="button" onClick={() => setEditingDeadlineFor(null)} className="text-xs font-semibold text-blue-600 px-2">Klaar</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingDeadlineFor(d)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {dateDeadlines[d] ? format(new Date(dateDeadlines[d]), 'EEE d MMM HH:mm', { locale: nl }) : 'Stel deadline in'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-60 text-sm flex items-center justify-center gap-2"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Aanmaken...' : 'Aanmaken'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 text-sm"
            >
              Annuleren
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TypeManagementModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [types, setTypes] = useState<AanwezigheidType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNaam, setNewNaam] = useState('');
  const [newDagenVoor, setNewDagenVoor] = useState(0);
  const [newTijd, setNewTijd] = useState('15:00');
  const [saving, setSaving] = useState(false);

  async function loadTypes() {
    const { data } = await supabase.from('aanwezigheid_types').select('*').order('volgorde');
    setTypes((data ?? []) as AanwezigheidType[]);
    setLoading(false);
  }

  useEffect(() => { loadTypes(); }, []);

  async function addType(e: React.FormEvent) {
    e.preventDefault();
    if (!newNaam.trim()) { setError('Vul een naam in.'); return; }
    setSaving(true);
    setError('');
    const { error: insertError } = await supabase.from('aanwezigheid_types').insert({
      naam: newNaam.trim(),
      deadline_dagen_voor: newDagenVoor,
      deadline_tijd: newTijd,
      volgorde: types.length + 1,
    });
    setSaving(false);
    if (insertError) { setError(insertError.message); return; }
    setNewNaam('');
    setNewDagenVoor(0);
    setNewTijd('15:00');
    setShowAddForm(false);
    await loadTypes();
  }

  async function deleteType(id: string) {
    if (!window.confirm('Deze standaard verwijderen?')) return;
    const { error: delError } = await supabase.from('aanwezigheid_types').delete().eq('id', id);
    if (delError) { setError(delError.message); return; }
    await loadTypes();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4 pb-0 sm:pb-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl z-10 max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl z-10">
          <div>
            <h2 className="text-base font-bold text-gray-900">Deadline-standaarden</h2>
            <p className="text-xs text-gray-400">Sjablonen voor deadlines bij nieuwe aanwezigheid</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="space-y-2">
              {types.map(t => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t.naam}</p>
                    <p className="text-xs text-gray-500">
                      {t.deadline_dagen_voor === 0 ? 'Dezelfde dag' : `${t.deadline_dagen_voor} dag(en) ervoor`} om {t.deadline_tijd}
                    </p>
                  </div>
                  <button onClick={() => deleteType(t.id)} className="p-2 text-gray-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {types.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Nog geen standaarden. Voeg er een toe.</p>
              )}
            </div>
          )}

          {showAddForm ? (
            <form onSubmit={addType} className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/30 p-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Naam</label>
                <input
                  type="text"
                  value={newNaam}
                  onChange={e => setNewNaam(e.target.value)}
                  placeholder="bijv. Training, Wedstrijd..."
                  required
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Dagen ervoor</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={newDagenVoor}
                    onChange={e => setNewDagenVoor(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Tijd</label>
                  <input
                    type="time"
                    value={newTijd}
                    onChange={e => setNewTijd(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Voorbeeld: 0 dagen + 15:00 = deadline op dezelfde dag als de activiteit om 15:00.
              </p>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Opslaan...' : 'Toevoegen'}
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="px-4 bg-gray-100 text-gray-600 font-semibold rounded-xl text-sm hover:bg-gray-200">
                  Annuleren
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm font-semibold text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              <Plus className="h-4 w-4" />Nieuwe standaard
            </button>
          )}

          <button onClick={onSaved} className="w-full bg-gray-100 text-gray-600 font-semibold py-3 rounded-xl text-sm hover:bg-gray-200">
            Klaar
          </button>
        </div>
      </div>
    </div>
  );
}

function EventContent({
  event, datums, responses, spelers, isHoofdbeheerder, onReload, onDelete,
}: {
  event: AanwezigheidEvenement;
  datums: AanwezigheidDatum[];
  responses: AanwezigheidResponse[];
  spelers: Speler[];
  isHoofdbeheerder: boolean;
  onReload: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { profile } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [selectedDateId, setSelectedDateId] = useState<string | null>(datums[0]?.id ?? null);
  const [status, setStatus] = useState<'aanwezig' | 'afwezig'>('aanwezig');
  const [reason, setReason] = useState('');
  const [savingResponse, setSavingResponse] = useState(false);
  const [dateError, setDateError] = useState('');
  const [editingDeadlineFor, setEditingDeadlineFor] = useState<string | null>(null);
  const [deadlineInput, setDeadlineInput] = useState('');

  useEffect(() => {
    if (!selectedDateId && datums[0]) setSelectedDateId(datums[0].id);
  }, [datums, selectedDateId]);

  const selectedDate = datums.find(d => d.id === selectedDateId) ?? null;
  const mySpeler = spelers.find(s => s.profile_id === profile?.id);
  const myResponse = responses.find(r => r.datum_id === selectedDateId && r.speler_id === mySpeler?.id);
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const leadingEmpty = (startOfMonth(month).getDay() + 6) % 7;
  const deadlinePassed = selectedDate?.deadline ? new Date(selectedDate.deadline).getTime() < Date.now() : false;

  useEffect(() => {
    if (myResponse) {
      setStatus(myResponse.status);
      setReason(myResponse.reden ?? '');
    }
  }, [myResponse]);

  function chooseDate(date: Date) {
    const existing = datums.find(d => d.datum === format(date, 'yyyy-MM-dd'));
    setSelectedDateId(existing?.id ?? null);
    setDateError('');
  }

  async function submitResponse() {
    if (!mySpeler || !selectedDate) return;
    if (status === 'afwezig' && !reason.trim()) { setDateError('Vul een reden in als je afwezig bent.'); return; }
    setSavingResponse(true);
    const { error } = await supabase.from('aanwezigheid_responses').upsert({
      evenement_id: event.id,
      datum_id: selectedDate.id,
      speler_id: mySpeler.id,
      status,
      reden: status === 'afwezig' ? reason.trim() : null,
      is_late: deadlinePassed,
    }, { onConflict: 'datum_id,speler_id' });
    setSavingResponse(false);
    if (error) setDateError(error.message);
    else { setDateError(''); await onReload(); }
  }

  async function saveDatumDeadline(datumId: string) {
    const parsed = new Date(deadlineInput);
    if (Number.isNaN(parsed.getTime())) { setDateError('Ongeldige deadline.'); return; }
    setSavingResponse(true);
    const { error } = await supabase.from('aanwezigheid_datums').update({ deadline: parsed.toISOString() }).eq('id', datumId);
    setSavingResponse(false);
    if (error) setDateError(error.message);
    else { setEditingDeadlineFor(null); setDateError(''); await onReload(); }
  }

  const deadlineLocal = (dl: string | null) => {
    if (!dl) return '';
    try { return new Date(dl).toISOString().slice(0, 16); } catch { return ''; }
  };

  return (
    <div className="space-y-4">
      {/* Calendar */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Kies een datum</p>
            <p className="text-xs text-gray-400">Blauwe dagen zijn ingepland. Klik om reacties te zien.</p>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setMonth(subMonths(month, 1))} className="rounded-lg p-2 hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setMonth(addMonths(month, 1))} className="rounded-lg p-2 hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mb-2 text-center text-sm font-semibold capitalize text-gray-800">{format(month, 'MMMM yyyy', { locale: nl })}</div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-gray-400">
          {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(d => <span key={d} className="py-1">{d}</span>)}
          {Array.from({ length: leadingEmpty }).map((_, i) => <span key={`e${i}`} />)}
          {days.map(day => {
            const planned = datums.find(d => d.datum === format(day, 'yyyy-MM-dd'));
            const selected = planned?.id === selectedDateId;
            const dl = planned?.deadline;
            const passed = dl ? new Date(dl).getTime() < Date.now() : false;
            return (
              <button
                key={day.toISOString()}
                onClick={() => planned && chooseDate(day)}
                disabled={!planned}
                className={`relative rounded-lg py-2 text-xs transition-colors ${
                  selected ? 'bg-blue-600 text-white'
                  : planned ? 'bg-blue-50 font-bold text-blue-700 hover:bg-blue-100 cursor-pointer'
                  : 'text-gray-300 cursor-default'
                }`}
              >
                {format(day, 'd')}
                {planned && <span className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${selected ? 'bg-white' : passed ? 'bg-red-500' : 'bg-blue-500'}`} />}
              </button>
            );
          })}
        </div>
        {dateError && <p className="mt-2 text-xs text-red-600">{dateError}</p>}
      </div>

      {/* Planned dates list */}
      {datums.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Geplande datums ({datums.length})</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {datums.map(d => {
              const count = responses.filter(r => r.datum_id === d.id).length;
              const dl = d.deadline;
              const passed = dl ? new Date(dl).getTime() < Date.now() : false;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDateId(d.id)}
                  className={`shrink-0 rounded-xl px-3 py-2.5 text-left transition-colors ${d.id === selectedDateId ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                >
                  <p className="text-sm font-semibold">{d.naam || event.naam}</p>
                  <p className={`text-xs ${d.id === selectedDateId ? 'text-blue-100' : 'text-gray-400'}`}>
                    {format(parseISO(d.datum), 'dd MMM yyyy', { locale: nl })}
                  </p>
                  {dl && (
                    <p className={`text-[10px] mt-0.5 ${passed ? 'text-red-500' : d.id === selectedDateId ? 'text-blue-200' : 'text-gray-400'}`}>
                      Deadline {format(parseISO(dl), 'dd MMM HH:mm', { locale: nl })}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected date detail - everyone sees responses */}
      {selectedDate ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-base font-semibold text-gray-900">{selectedDate.naam || event.naam}</p>
              <p className="text-xs text-gray-400 capitalize">{format(parseISO(selectedDate.datum), 'EEEE d MMMM yyyy', { locale: nl })}</p>
              {selectedDate.deadline && (
                <p className={`text-xs mt-0.5 flex items-center gap-1 ${deadlinePassed ? 'text-red-600' : 'text-gray-500'}`}>
                  <Clock className="h-3 w-3" />
                  Deadline {format(parseISO(selectedDate.deadline), 'd MMMM HH:mm', { locale: nl })}
                  {deadlinePassed && ' (verstreken)'}
                </p>
              )}
            </div>
            {isHoofdbeheerder && (
              <div className="flex gap-2">
                {selectedDate.deadline && !editingDeadlineFor && (
                  <button
                    onClick={() => { setDeadlineInput(deadlineLocal(selectedDate.deadline)); setEditingDeadlineFor(selectedDate.id); }}
                    className="text-xs text-blue-600 font-medium hover:text-blue-800"
                  >
                    Deadline wijzigen
                  </button>
                )}
                <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />Verwijder
                </button>
              </div>
            )}
          </div>

          {/* Deadline editing for this specific date */}
          {editingDeadlineFor === selectedDate.id && (
            <div className="mb-4 flex gap-2 rounded-xl bg-blue-50 p-3">
              <input
                type="datetime-local"
                value={deadlineInput}
                onChange={e => setDeadlineInput(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={() => saveDatumDeadline(selectedDate.id)} disabled={savingResponse} className="bg-green-600 text-white rounded-xl px-3 py-2 text-xs font-semibold hover:bg-green-700 disabled:opacity-60">Opslaan</button>
              <button onClick={() => setEditingDeadlineFor(null)} className="bg-gray-100 text-gray-600 rounded-xl px-3 py-2 text-xs font-semibold hover:bg-gray-200">Annuleer</button>
            </div>
          )}

          <AllResponses responses={responses.filter(r => r.datum_id === selectedDate.id)} spelers={spelers} />

          {mySpeler ? (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <ResponseForm
                response={myResponse}
                status={status}
                setStatus={setStatus}
                reason={reason}
                setReason={setReason}
                deadlinePassed={deadlinePassed}
                saving={savingResponse}
                onSubmit={submitResponse}
              />
            </div>
          ) : (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-sm text-gray-500">Je account is nog niet gekoppeld aan een speler.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
          Klik op een blauwe datum om reacties te zien.
        </div>
      )}
    </div>
  );
}

function AllResponses({ responses, spelers }: { responses: AanwezigheidResponse[]; spelers: Speler[] }) {
  const responseMap = new Map(responses.map(r => [r.speler_id, r]));
  const aanwezig = responses.filter(r => r.status === 'aanwezig').length;
  const afwezig = responses.filter(r => r.status === 'afwezig').length;
  const geen = spelers.length - aanwezig - afwezig;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Reacties ({responses.length}/{spelers.length})</p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />{aanwezig} aanwezig</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />{afwezig} afwezig</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-300" />{geen} geen reactie</span>
        </div>
      </div>
      <div className="space-y-2">
        {spelers.map(speler => {
          const r = responseMap.get(speler.id);
          return (
            <div key={speler.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
              <div className={`h-2.5 w-2.5 rounded-full ${r?.status === 'aanwezig' ? 'bg-green-500' : r?.status === 'afwezig' ? 'bg-red-500' : 'bg-gray-300'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800">{speler.naam}</p>
                  {r?.is_late && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                      <AlertTriangle className="h-2.5 w-2.5" />Te laat
                    </span>
                  )}
                </div>
                {r?.status === 'afwezig' && r.reden && <p className="truncate text-xs text-gray-500 mt-0.5">{r.reden}</p>}
              </div>
              <span className={`text-xs font-semibold ${r?.status === 'aanwezig' ? 'text-green-700' : r?.status === 'afwezig' ? 'text-red-700' : 'text-gray-400'}`}>
                {r?.status === 'aanwezig' ? 'Aanwezig' : r?.status === 'afwezig' ? 'Afwezig' : 'Geen reactie'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResponseForm({
  response, status, setStatus, reason, setReason, deadlinePassed, saving, onSubmit,
}: {
  response: AanwezigheidResponse | undefined;
  status: 'aanwezig' | 'afwezig';
  setStatus: (value: 'aanwezig' | 'afwezig') => void;
  reason: string;
  setReason: (value: string) => void;
  deadlinePassed: boolean;
  saving: boolean;
  onSubmit: () => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Jouw reactie</p>
      {deadlinePassed && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>De deadline is verstreken. Je kunt nog steeds reageren, maar dit wordt gemarkeerd als te laat en getoond bij het invullen van de boetes.</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setStatus('aanwezig')}
          className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors ${status === 'aanwezig' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'}`}
        >Aanwezig</button>
        <button
          onClick={() => setStatus('afwezig')}
          className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors ${status === 'afwezig' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'}`}
        >Afwezig</button>
      </div>
      {status === 'afwezig' && (
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Waarom ben je afwezig?"
          rows={3}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
      <button onClick={onSubmit} disabled={saving} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
        {saving ? 'Opslaan...' : response ? 'Reactie wijzigen' : 'Reactie opslaan'}
      </button>
    </div>
  );
}