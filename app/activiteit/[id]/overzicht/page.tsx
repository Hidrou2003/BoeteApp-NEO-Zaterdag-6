'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Activiteit, ActiviteitSpeler, Speler, formatBedrag } from '@/lib/supabase';
import { ArrowLeft, CheckCircle2, UserCheck, User, UserX, ChevronDown, ChevronUp, Home, Zap, Search, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function OverzichtPage() {
  return (
    <AuthGuard>
      <AppShell>
        <OverzichtContent />
      </AppShell>
    </AuthGuard>
  );
}

function OverzichtContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = searchParams.get('from') === 'boetes' ? '/weekoverzicht' : '/';
  const { profile } = useAuth();
  const [activiteit, setActiviteit] = useState<Activiteit | null>(null);
  const [spelers, setSpelers] = useState<ActiviteitSpeler[]>([]);
  const [notAddedSpelers, setNotAddedSpelers] = useState<Speler[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [search, setSearch] = useState('');

  const isBeheerder = profile?.rol === 'beheerder' || profile?.rol === 'hoofdbeheerder';

  useEffect(() => { load(); }, [id]);

  async function load() {
    const [{ data: act }, { data: sps }, { data: allSpelers }] = await Promise.all([
      supabase.from('activiteiten').select('*, gemaakt_door_profile:profiles!gemaakt_door(naam,email), gewijzigd_door_profile:profiles!gewijzigd_door(naam,email)').eq('id', id).single(),
      supabase.from('activiteit_spelers')
        .select('*, spelers(*), boete_items(*, boetecategorieen(*))')
        .eq('activiteit_id', id)
        .order('totaal_bedrag', { ascending: false }),
      supabase.from('spelers').select('*').eq('actief', true).eq('doe_mee_aan_boetes', true).order('naam'),
    ]);
    setActiviteit(act);
    setSpelers(sps ?? []);
    const addedIds = new Set((sps ?? []).map(s => s.speler_id));
    setNotAddedSpelers((allSpelers ?? []).filter(s => !addedIds.has(s.id)));
    setLoading(false);
  }

  async function handleFinalize() {
    setFinalizing(true);
    await supabase.from('activiteiten').update({ afgerond: true }).eq('id', id);
    router.push(returnPath);
  }

  async function handleDelete() {
    await supabase.from('activiteiten').delete().eq('id', id);
    router.push(returnPath);
  }

  const totaalBedrag = spelers.reduce((sum, s) => sum + s.totaal_bedrag, 0);
  const aanwezigen = spelers.filter(s => s.aanwezigheid === 'aanwezig');
  const geoorloofd = spelers.filter(s => s.aanwezigheid === 'geoorloofd_afwezig');
  const ongeoorloofd = spelers.filter(s => s.aanwezigheid === 'ongeoorloofd_afwezig');

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Laden...</div>;
  if (!activiteit) return <div className="text-center py-16 text-gray-400 text-sm">Niet gevonden.</div>;

  const datum = activiteit.datum ? format(parseISO(activiteit.datum), 'EEEE d MMMM yyyy', { locale: nl }) : '';
  const makerNaam = activiteit.gemaakt_door_profile?.naam || activiteit.gemaakt_door_profile?.email || null;
  const wijzigerNaam = activiteit.gewijzigd_door_profile?.naam || activiteit.gewijzigd_door_profile?.email || null;
  const formatTimestamp = (ts: string | null | undefined) => {
    if (!ts) return '';
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} / ${hh}:${min}`;
  };
  const makerTijd = formatTimestamp(activiteit.gemaakt_op);
  const wijzigerTijd = formatTimestamp(activiteit.gewijzigd_op);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={returnPath} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-gray-900 truncate">{activiteit.naam}</h1>
            {activiteit.is_dubbel && <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-1"><Zap className="w-3 h-3" />x2</span>}
          </div>
          <p className="text-sm text-gray-500 capitalize">{datum}</p>
          {(makerNaam || wijzigerNaam) && (
            <div className="flex flex-col gap-0.5 mt-1 text-xs text-gray-400">
              {makerNaam && <span>Ingevuld door <strong className="font-medium text-gray-500">{makerNaam}</strong>{makerTijd && <span className="text-gray-400 ml-1">({makerTijd})</span>}</span>}
              {wijzigerNaam && <span>Gewijzigd door <strong className="font-medium text-gray-500">{wijzigerNaam}</strong>{wijzigerTijd && <span className="text-gray-400 ml-1">({wijzigerTijd})</span>}</span>}
            </div>
          )}
        </div>
        {activiteit.afgerond
          ? <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 font-semibold px-2 py-1 rounded-full"><CheckCircle2 className="w-3.5 h-3.5" />Afgerond</span>
          : null
        }
      </div>

      {/* Summary card */}
      <div className="bg-blue-600 text-white rounded-2xl p-5">
        <p className="text-blue-200 text-sm font-medium mb-1">Totaal uitgedeeld</p>
        <p className="text-4xl font-bold">{formatBedrag(totaalBedrag)}</p>
        <div className="flex gap-4 mt-3 text-sm text-blue-100">
          <span>{aanwezigen.length} aanwezig</span>
          <span>{geoorloofd.length} geoorloofd afwezig</span>
          <span>{ongeoorloofd.length} ongeoorloofd</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Zoek speler..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        />
      </div>

      {/* Player list */}
      <div className="space-y-2">
        {spelers.filter(sp => (sp.spelers?.naam ?? '').toLowerCase().includes(search.toLowerCase())).map(sp => {
          const naam = sp.spelers?.naam ?? '?';
          const isExpanded = expanded === sp.id;
          const items = sp.boete_items ?? [];

          let statusIcon = <UserCheck className="w-4 h-4 text-green-600" />;
          let statusBg = 'bg-green-100';
          if (sp.aanwezigheid === 'geoorloofd_afwezig') { statusIcon = <User className="w-4 h-4 text-amber-600" />; statusBg = 'bg-amber-100'; }
          if (sp.aanwezigheid === 'ongeoorloofd_afwezig') { statusIcon = <UserX className="w-4 h-4 text-red-600" />; statusBg = 'bg-red-100'; }

          return (
            <div key={sp.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${statusBg}`}>
                  {statusIcon}
                </div>
                {isBeheerder ? (
                  <Link
                    href={`/activiteit/${id}/speler/${sp.speler_id}`}
                    className="flex-1 text-sm font-semibold text-gray-800 hover:text-blue-600 transition-colors"
                  >
                    {naam}
                  </Link>
                ) : (
                  <button
                    onClick={() => setExpanded(isExpanded ? null : sp.id)}
                    className="flex-1 text-sm font-semibold text-gray-800 text-left"
                  >
                    {naam}
                  </button>
                )}
                <button
                  onClick={() => setExpanded(isExpanded ? null : sp.id)}
                  className="flex items-center gap-2 flex-shrink-0"
                >
                  <span className="text-sm font-bold text-gray-900">{formatBedrag(sp.totaal_bedrag)}</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-50 px-4 py-3 space-y-1.5 bg-gray-50">
                  {items.length > 0 && items.map(item => (
                    <div key={item.id} className="flex justify-between text-xs">
                      <span className="text-gray-600">{item.aantal}x {item.boetecategorieen?.naam}</span>
                      <span className="font-semibold text-gray-800">{formatBedrag(item.subtotaal)}</span>
                    </div>
                  ))}
                  {sp.gemiddeld_bedrag > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Gemiddelde (afwezig)</span>
                      <span className="font-semibold text-gray-700">{formatBedrag(sp.gemiddeld_bedrag)}</span>
                    </div>
                  )}
                  {sp.opslag_bedrag > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-red-600">Ongeoorloofd afwezig opslag</span>
                      <span className="font-semibold text-red-700">{formatBedrag(sp.opslag_bedrag)}</span>
                    </div>
                  )}
                  {items.length === 0 && sp.gemiddeld_bedrag === 0 && sp.opslag_bedrag === 0 && (
                    <p className="text-xs text-gray-400 text-center py-1">Geen boetes</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Not yet added players */}
      {isBeheerder && notAddedSpelers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Nog niet ingevuld</p>
          {notAddedSpelers.filter(sp => sp.naam.toLowerCase().includes(search.toLowerCase())).map(sp => (
            <Link
              key={sp.id}
              href={`/activiteit/${id}/speler/${sp.id}`}
              className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-100">
                <User className="w-4 h-4 text-gray-400" />
              </div>
              <span className="flex-1 text-sm font-medium text-gray-500">{sp.naam}</span>
              <span className="text-xs text-blue-600 font-medium">Invullen</span>
            </Link>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {isBeheerder && !activiteit.afgerond && (
        <button
          onClick={handleFinalize}
          disabled={finalizing}
          className="w-full flex items-center justify-center gap-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-4 rounded-2xl transition-colors shadow-md shadow-green-100 text-base disabled:opacity-60"
        >
          <CheckCircle2 className="w-5 h-5" />
          {finalizing ? 'Opslaan...' : 'Afronden & terug naar beginscherm'}
        </button>
      )}

      {activiteit.afgerond && (
        <Link
          href={returnPath}
          className="w-full flex items-center justify-center gap-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-4 rounded-2xl transition-colors text-base"
        >
          <Home className="w-5 h-5" />
          Terug naar overzicht
        </Link>
      )}

      {/* Continue flow button */}
      {isBeheerder && !activiteit.afgerond && (
        <Link
          href={`/activiteit/${id}/flow`}
          className="w-full flex items-center justify-center gap-2 text-blue-600 hover:text-blue-800 font-medium text-sm py-2 transition-colors"
        >
          Terug naar speler-flow
        </Link>
      )}

      {/* Delete button */}
      {isBeheerder && (
        <button
          onClick={() => setConfirmDelete(true)}
          className="w-full flex items-center justify-center gap-2 text-red-500 hover:text-red-700 font-medium text-sm py-2 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Activiteit verwijderen
        </button>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Activiteit verwijderen?</p>
                <p className="text-sm text-gray-500">Dit kan niet ongedaan gemaakt worden.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Annuleren</button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
