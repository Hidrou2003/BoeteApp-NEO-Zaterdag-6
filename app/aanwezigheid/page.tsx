'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, AanwezigheidDatum, AanwezigheidEvenement, AanwezigheidResponse, Speler } from '@/lib/supabase';
import { CalendarCheck, ChevronLeft, ChevronRight, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { addMonths, eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
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

  async function loadEvenementen() {
    setLoading(true);
    const [{ data: events }, { data: activeSpelers }] = await Promise.all([
      supabase.from('aanwezigheid_evenementen').select('*').order('deadline', { ascending: false }),
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

  async function handleCreateEvent() {
    if (!profile) return;
    const naam = window.prompt('Naam van de aanwezigheid:', 'Aanwezigheid');
    if (!naam?.trim()) return;
    const deadline = window.prompt('Deadline (bijv. 2026-10-25 20:00):', `${format(new Date(), 'yyyy-MM-dd')} 20:00`);
    if (!deadline) return;
    const parsedDeadline = new Date(deadline.replace(' ', 'T'));
    if (Number.isNaN(parsedDeadline.getTime())) { setMessage('Vul een geldige deadline in.'); return; }
    const { data, error } = await supabase.from('aanwezigheid_evenementen').insert({ naam: naam.trim(), deadline: parsedDeadline.toISOString(), created_by: profile.id }).select().maybeSingle();
    if (error || !data) { setMessage(error?.message ?? 'Aanmaken mislukt.'); return; }
    setMessage('Aanwezigheid aangemaakt.');
    await loadEvenementen();
    setSelectedId(data.id);
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
          <button onClick={handleCreateEvent} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700">
            <Plus className="h-4 w-4" />Nieuw
          </button>
        )}
      </div>

      {message && (
        <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>{message}</span>
          <button onClick={() => setMessage('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {evenementen.length === 0 ? (
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
                <p className="text-sm font-semibold">{event.naam}</p>
                <p className={`mt-0.5 text-xs ${event.id === selectedId ? 'text-blue-100' : 'text-gray-400'}`}>Deadline {format(parseISO(event.deadline), 'dd MMM HH:mm', { locale: nl })}</p>
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
  const [dateName, setDateName] = useState('');
  const [status, setStatus] = useState<'aanwezig' | 'afwezig'>('aanwezig');
  const [reason, setReason] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [savingResponse, setSavingResponse] = useState(false);
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    if (!selectedDateId && datums[0]) setSelectedDateId(datums[0].id);
  }, [datums, selectedDateId]);

  const selectedDate = datums.find(d => d.id === selectedDateId) ?? null;
  const mySpeler = spelers.find(s => s.profile_id === profile?.id);
  const myResponse = responses.find(r => r.datum_id === selectedDateId && r.speler_id === mySpeler?.id);
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const leadingEmpty = (startOfMonth(month).getDay() + 6) % 7;
  const deadlinePassed = new Date(event.deadline).getTime() < Date.now();

  function chooseDate(date: Date) {
    const existing = datums.find(d => d.datum === format(date, 'yyyy-MM-dd'));
    setSelectedDateId(existing?.id ?? null);
    setDateName(existing?.naam ?? '');
    setDateError('');
  }

  async function addDate(date: Date) {
    if (!isHoofdbeheerder) return;
    const name = window.prompt(`Naam voor ${format(date, 'dd-MM-yyyy')}:`, 'Activiteit');
    if (!name?.trim()) return;
    setSavingDate(true);
    const { data, error } = await supabase.from('aanwezigheid_datums').insert({ evenement_id: event.id, datum: format(date, 'yyyy-MM-dd'), naam: name.trim() }).select().maybeSingle();
    setSavingDate(false);
    if (error) { setDateError(error.message); return; }
    setSelectedDateId(data?.id ?? null);
    setDateName(name.trim());
    await onReload();
  }

  async function saveDate() {
    if (!isHoofdbeheerder) return;
    if (!dateName.trim()) { setDateError('Geef deze datum eerst een naam.'); return; }
    const selectedDay = datums.find(d => d.id === selectedDateId);
    if (!selectedDay) { setDateError('Kies een datum in de kalender.'); return; }
    setSavingDate(true);
    const { error } = await supabase.from('aanwezigheid_datums').update({ naam: dateName.trim() }).eq('id', selectedDay.id);
    setSavingDate(false);
    if (error) setDateError(error.message); else await onReload();
  }

  async function submitResponse() {
    if (!mySpeler || !selectedDate || deadlinePassed) return;
    if (status === 'afwezig' && !reason.trim()) { setDateError('Vul een reden in als je afwezig bent.'); return; }
    setSavingResponse(true);
    const { error } = await supabase.from('aanwezigheid_responses').upsert({
      evenement_id: event.id,
      datum_id: selectedDate.id,
      speler_id: mySpeler.id,
      status,
      reden: status === 'afwezig' ? reason.trim() : null,
    }, { onConflict: 'datum_id,speler_id' });
    setSavingResponse(false);
    if (error) setDateError(error.message);
    else { setDateError(''); await onReload(); }
  }

  return (
    <div className="space-y-4">
      {/* Calendar */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Kies een datum</p>
            <p className="text-xs text-gray-400">Blauwe dagen zijn ingepland.</p>
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
            return (
              <button
                key={day.toISOString()}
                onClick={() => planned ? chooseDate(day) : addDate(day)}
                disabled={!isHoofdbeheerder && !planned}
                className={`relative rounded-lg py-2 text-xs transition-colors ${
                  selected ? 'bg-blue-600 text-white'
                  : planned ? 'bg-blue-50 font-bold text-blue-700 hover:bg-blue-100'
                  : isHoofdbeheerder ? 'text-gray-500 hover:bg-gray-100'
                  : 'text-gray-300'
                }`}
              >
                {format(day, 'd')}
                {planned && <span className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${selected ? 'bg-white' : 'bg-blue-500'}`} />}
              </button>
            );
          })}
        </div>
        {isHoofdbeheerder && selectedDate && (
          <div className="mt-4 flex gap-2">
            <input
              value={dateName}
              onChange={e => setDateName(e.target.value)}
              placeholder="Naam van deze datum"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={saveDate} disabled={savingDate} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
              <Save className="h-3.5 w-3.5" />Opslaan
            </button>
          </div>
        )}
        {dateError && <p className="mt-2 text-xs text-red-600">{dateError}</p>}
      </div>

      {/* Selected date detail */}
      {selectedDate ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-base font-semibold text-gray-900">{selectedDate.naam || 'Activiteit'}</p>
              <p className="text-xs text-gray-400 capitalize">{format(parseISO(selectedDate.datum), 'EEEE d MMMM yyyy', { locale: nl })}</p>
            </div>
            {isHoofdbeheerder && (
              <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-600">
                <Trash2 className="h-3.5 w-3.5" />Verwijder aanwezigheid
              </button>
            )}
          </div>

          {isHoofdbeheerder ? (
            <AdminResponses responses={responses.filter(r => r.datum_id === selectedDate.id)} spelers={spelers} />
          ) : (
            <ResponseForm
              response={myResponse}
              status={status}
              setStatus={setStatus}
              reason={reason}
              setReason={setReason}
              deadlinePassed={deadlinePassed}
              hasPlayer={Boolean(mySpeler)}
              saving={savingResponse}
              onSubmit={submitResponse}
            />
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
          Kies een blauwe datum om te reageren.
        </div>
      )}
    </div>
  );
}

function ResponseForm({
  response, status, setStatus, reason, setReason, deadlinePassed, hasPlayer, saving, onSubmit,
}: {
  response: AanwezigheidResponse | undefined;
  status: 'aanwezig' | 'afwezig';
  setStatus: (value: 'aanwezig' | 'afwezig') => void;
  reason: string;
  setReason: (value: string) => void;
  deadlinePassed: boolean;
  hasPlayer: boolean;
  saving: boolean;
  onSubmit: () => Promise<void>;
}) {
  useEffect(() => {
    if (response) {
      setStatus(response.status);
      setReason(response.reden ?? '');
    }
  }, [response, setStatus, setReason]);

  if (!hasPlayer) return <p className="text-sm text-gray-500">Je account is nog niet gekoppeld aan een speler.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Jouw reactie</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setStatus('aanwezig')}
          disabled={deadlinePassed}
          className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold ${status === 'aanwezig' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'} disabled:opacity-50`}
        >Aanwezig</button>
        <button
          onClick={() => setStatus('afwezig')}
          disabled={deadlinePassed}
          className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold ${status === 'afwezig' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'} disabled:opacity-50`}
        >Afwezig</button>
      </div>
      {status === 'afwezig' && (
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          disabled={deadlinePassed}
          placeholder="Waarom ben je afwezig?"
          rows={3}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
      )}
      {deadlinePassed ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">De deadline is verstreken. Je kunt niet meer reageren.</p>
      ) : (
        <button onClick={onSubmit} disabled={saving} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Opslaan...' : response ? 'Reactie wijzigen' : 'Reactie opslaan'}
        </button>
      )}
    </div>
  );
}

function AdminResponses({ responses, spelers }: { responses: AanwezigheidResponse[]; spelers: Speler[] }) {
  const responseMap = new Map(responses.map(r => [r.speler_id, r]));
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-blue-600" />
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Reacties ({responses.length}/{spelers.length})</p>
      </div>
      <div className="space-y-2">
        {spelers.map(speler => {
          const r = responseMap.get(speler.id);
          return (
            <div key={speler.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
              <div className={`h-2.5 w-2.5 rounded-full ${r?.status === 'aanwezig' ? 'bg-green-500' : r?.status === 'afwezig' ? 'bg-red-500' : 'bg-gray-300'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">{speler.naam}</p>
                {r?.status === 'afwezig' && r.reden && <p className="truncate text-xs text-gray-500">{r.reden}</p>}
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