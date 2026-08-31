'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Activiteit, formatBedrag } from '@/lib/supabase';
import { Plus, ChevronRight, Clock, AlertTriangle, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function HomePage() {
  return (
    <AuthGuard>
      <AppShell>
        <HomeContent />
      </AppShell>
    </AuthGuard>
  );
}

function HomeContent() {
  const { profile } = useAuth();
  const router = useRouter();
  const [activiteiten, setActiviteiten] = useState<(Activiteit & { totaal?: number; count?: number; volledig?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);

  const isBeheerder = profile?.rol === 'beheerder' || profile?.rol === 'hoofdbeheerder';
  const isKijker = profile?.rol === 'kijker';

  useEffect(() => {
    if (isKijker) {
      router.replace('/weekoverzicht');
      return;
    }
    loadActiviteiten();
  }, [isKijker]);

  async function loadActiviteiten() {
    setLoading(true);
    const { data } = await supabase
      .from('activiteiten')
      .select('*, gemaakt_door_profile:profiles!gemaakt_door(naam,email), gewijzigd_door_profile:profiles!gewijzigd_door(naam,email)')
      .order('datum', { ascending: false })
      .order('created_at', { ascending: false });

    if (data) {
      const { data: allSpelers } = await supabase.from('spelers').select('id').eq('actief', true).eq('doe_mee_aan_boetes', true);
      const totalActiveSpelers = allSpelers?.length ?? 0;

      const withTotals = await Promise.all(
        data.map(async (a) => {
          const { data: spelers } = await supabase
            .from('activiteit_spelers')
            .select('totaal_bedrag, aanwezigheid')
            .eq('activiteit_id', a.id);
          const totaal = spelers?.reduce((sum, s) => sum + s.totaal_bedrag, 0) ?? 0;
          const count = spelers?.length ?? 0;
          const volledig = count >= totalActiveSpelers && (spelers?.every(s => s.aanwezigheid !== null) ?? false);
          return { ...a, totaal, count, volledig };
        })
      );
      setActiviteiten(withTotals);
    }
    setLoading(false);
  }

  async function handleNewActiviteit() {
    router.push('/activiteit/nieuw');
  }

  async function handleDelete(id: string) {
    await supabase.from('activiteiten').delete().eq('id', id);
    loadActiviteiten();
  }

  function handleActiviteitClick(a: Activiteit & { volledig?: boolean }) {
    if (a.afgerond) {
      router.push(`/activiteit/${a.id}/overzicht`);
    } else {
      router.push(`/activiteit/${a.id}/flow`);
    }
  }

  const open = activiteiten.filter(a => !a.afgerond);
  const closed = activiteiten.filter(a => a.afgerond);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Hallo{profile?.naam ? `, ${profile.naam.split(' ')[0]}` : ''}!
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Overzicht van alle activiteiten</p>
      </div>

      {isBeheerder && (
        <button
          onClick={handleNewActiviteit}
          className="w-full flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-4 rounded-2xl transition-colors shadow-md shadow-blue-100 text-base"
        >
          <Plus className="w-5 h-5" />
          Nieuwe activiteit starten
        </button>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Bezig</h2>
              <div className="space-y-3">
                {open.map(a => (
                  <ActiviteitCard
                    key={a.id}
                    activiteit={a}
                    totaal={a.totaal}
                    volledig={a.volledig}
                    onOpen={() => handleActiviteitClick(a)}
                    onDelete={isBeheerder ? () => handleDelete(a.id) : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {closed.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Afgerond</h2>
              <div className="space-y-3">
                {closed.map(a => (
                  <ActiviteitCard
                    key={a.id}
                    activiteit={a}
                    totaal={a.totaal}
                    volledig={a.volledig}
                    onOpen={() => handleActiviteitClick(a)}
                    onDelete={isBeheerder ? () => handleDelete(a.id) : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {activiteiten.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nog geen activiteiten</p>
              <p className="text-sm mt-1">{isBeheerder ? 'Maak een nieuwe activiteit aan.' : 'Er zijn nog geen activiteiten.'}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActiviteitCard({
  activiteit, totaal, volledig, onOpen, onDelete,
}: {
  activiteit: Activiteit & { totaal?: number; volledig?: boolean };
  totaal?: number;
  volledig?: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const nietVolledig = !activiteit.afgerond && volledig === false;
  const datum = activiteit.datum ? format(parseISO(activiteit.datum), 'EEE d MMM. yyyy', { locale: nl }) : '';
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={onOpen} className="w-full flex items-start justify-between px-4 py-4 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 truncate">{activiteit.naam}</p>
            {activiteit.is_dubbel && (
              <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0">x2</span>
            )}
          </div>
          <p className="text-xs text-gray-400 capitalize mt-0.5">{datum}</p>
          {(makerNaam || wijzigerNaam) && (
            <div className="mt-1 space-y-0.5 text-xs text-gray-400">
              {makerNaam && (
                <p className="truncate">
                  <span>Ingevuld door: </span>
                  <strong className="font-medium text-gray-500">{makerNaam}</strong>
                  {makerTijd && <span className="text-gray-400 ml-1">({makerTijd})</span>}
                </p>
              )}
              {wijzigerNaam && (
                <p className="truncate">
                  <span>Gewijzigd door: </span>
                  <strong className="font-medium text-gray-500">{wijzigerNaam}</strong>
                  {wijzigerTijd && <span className="text-gray-400 ml-1">({wijzigerTijd})</span>}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          {nietVolledig && (
            <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0" title="Nog niet volledig ingevuld">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
            </span>
          )}
          {totaal !== undefined && totaal > 0 && (
            <span className="text-base font-bold text-blue-700">{formatBedrag(totaal)}</span>
          )}
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </div>
      </button>
      {onDelete && (
        <div className="px-4 pb-2 -mt-1 flex justify-end">
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Verwijderen?</span>
              <button
                onClick={() => { setConfirming(false); onDelete(); }}
                className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3 h-3" />
                Ja
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                <X className="w-3 h-3" />
                Nee
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 transition-colors"
              title="Activiteit verwijderen"
            >
              <Trash2 className="w-3 h-3" />
              Verwijderen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
