'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { supabase, Activiteit, Speler, Boetecategorie, calcBedrag, formatBedrag, AppInstellingen } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ArrowLeft, ArrowRight, CheckCircle, Minus, Plus, Zap, User, UserCheck, UserX, Calendar, Euro, Users } from 'lucide-react';
import Link from 'next/link';

type Aanwezigheid = 'aanwezig' | 'geoorloofd_afwezig' | 'ongeoorloofd_afwezig';

interface SpelerState {
  speler: Speler;
  aanwezigheid: Aanwezigheid | null;
  boetes: Record<string, { aantal: number; bedrag?: number }>; // categorie_id -> {aantal, optional custom bedrag for open_bedrag}
}

interface TeamBoeteState {
  cat: Boetecategorie;
  aantal: number;
  bedrag?: number; // for open_bedrag
}

export default function FlowPage() {
  return (
    <AuthGuard>
      <AppShell>
        <FlowContent />
      </AppShell>
    </AuthGuard>
  );
}

function FlowContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = searchParams.get('from') === 'boetes' ? '/weekoverzicht' : '/';
  const { profile } = useAuth();
  const [activiteit, setActiviteit] = useState<Activiteit | null>(null);
  const [spelers, setSpelers] = useState<SpelerState[]>([]);
  const [categorieen, setCategorieen] = useState<Boetecategorie[]>([]);
  const [teamBoetes, setTeamBoetes] = useState<TeamBoeteState[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'spelers' | 'team'>('spelers');
  const [instellingen, setInstellingen] = useState<AppInstellingen | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const [{ data: act }, { data: sps }, { data: cats }, { data: existingSpelers }, { data: inst }] = await Promise.all([
      supabase.from('activiteiten').select('*, gemaakt_door_profile:profiles!gemaakt_door(naam,email), gewijzigd_door_profile:profiles!gewijzigd_door(naam,email)').eq('id', id).single(),
      supabase.from('spelers').select('*').eq('actief', true).eq('doe_mee_aan_boetes', true).order('naam'),
      supabase.from('boetecategorieen').select('*').eq('actief', true).order('volgorde'),
      supabase.from('activiteit_spelers').select('*, boete_items(*)').eq('activiteit_id', id),
      supabase.from('app_instellingen').select('*').eq('id', 1).maybeSingle(),
    ]);
    setInstellingen(inst as AppInstellingen | null);

    if (!act || !sps || !cats) { setLoading(false); return; }
    setActiviteit(act);

    // Fetch boete_items only from completed past activities (excluding the current one)
    const { data: pastAsRows } = await supabase
      .from('activiteit_spelers')
      .select('id')
      .neq('activiteit_id', id)
      .in('activiteit_id',
        (await supabase.from('activiteiten').select('id').eq('afgerond', true).neq('id', id)).data?.map((a: { id: string }) => a.id) ?? []
      );
    const pastAsIds = (pastAsRows ?? []).map((r: { id: string }) => r.id);
    const { data: allBoeteItems } = pastAsIds.length > 0
      ? await supabase.from('boete_items').select('categorie_id, aantal').in('activiteit_speler_id', pastAsIds)
      : { data: [] };

    // Sort categories by usage frequency across past completed activities (most used first), then by volgorde
    const usageCount: Record<string, number> = {};
    for (const item of allBoeteItems ?? []) {
      usageCount[item.categorie_id] = (usageCount[item.categorie_id] ?? 0) + (item.aantal ?? 0);
    }
    const sortedCats = [...cats].sort((a, b) => {
      const ua = usageCount[a.id] ?? 0;
      const ub = usageCount[b.id] ?? 0;
      if (ub !== ua) return ub - ua;
      return a.volgorde - b.volgorde;
    });
    setCategorieen(sortedCats);

    const normaleCats = sortedCats.filter(c => !c.is_teamboete);
    const teamCats = sortedCats.filter(c => c.is_teamboete);

    // Build player states
    const states: SpelerState[] = sps.map(sp => {
      const existing = existingSpelers?.find(e => e.speler_id === sp.id);
      const boetes: Record<string, { aantal: number; bedrag?: number }> = {};
      if (existing?.boete_items) {
        for (const item of existing.boete_items) {
          // Only load non-teamboete items into player state
          const cat = sortedCats.find(c => c.id === item.categorie_id);
          if (cat && !cat.is_teamboete) {
            boetes[item.categorie_id] = { aantal: item.aantal, bedrag: item.bedrag_per_stuk };
          }
        }
      }
      return { speler: sp, aanwezigheid: existing?.aanwezigheid ?? null, boetes };
    });
    setSpelers(states);

    // Build team boete states - load from first player's boete_items (team boetes are same for all)
    const firstExisting = existingSpelers?.[0];
    const teamBoeteStates: TeamBoeteState[] = teamCats.map(cat => {
      const item = firstExisting?.boete_items?.find((bi: { categorie_id: string; aantal: number; bedrag_per_stuk: number }) => bi.categorie_id === cat.id);
      return { cat, aantal: item?.aantal ?? 0, bedrag: item?.bedrag_per_stuk };
    });
    setTeamBoetes(teamBoeteStates);

    // Resume at the saved index, or the first speler that hasn't been filled in
    const savedIndex = act.laatste_speler_index ?? 0;
    const firstEmpty = states.findIndex(s => s.aanwezigheid === null);
    if (firstEmpty === -1) {
      // All filled - check if team boetes are filled
      const teamFilled = teamBoeteStates.some(tb => tb.aantal > 0);
      if (teamFilled || teamCats.length === 0) {
        setPhase('spelers');
        setIndex(Math.min(savedIndex, states.length - 1));
      } else {
        setPhase('team');
      }
      setIndex(Math.min(savedIndex, states.length - 1));
    } else {
      setPhase('spelers');
      setIndex(Math.min(savedIndex, firstEmpty));
    }

    setLoading(false);
  }

  const current = spelers[index];
  const normaleCats = categorieen.filter(c => !c.is_teamboete);

  function setAanwezigheid(a: Aanwezigheid) {
    setSpelers(prev => prev.map((s, i) => i === index ? { ...s, aanwezigheid: a } : s));
  }

  function setBoeteCount(catId: string, delta: number) {
    setSpelers(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const cur = s.boetes[catId]?.aantal ?? 0;
      const next = Math.max(0, cur + delta);
      const boetes = { ...s.boetes };
      if (next === 0) delete boetes[catId];
      else boetes[catId] = { aantal: next, bedrag: s.boetes[catId]?.bedrag };
      return { ...s, boetes };
    }));
  }

  function setBoeteBedrag(catId: string, bedrag: number) {
    setSpelers(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const cur = s.boetes[catId];
      if (!cur) return s;
      const boetes = { ...s.boetes };
      boetes[catId] = { ...cur, bedrag };
      return { ...s, boetes };
    }));
  }

  function setTeamBoeteCount(catId: string, delta: number) {
    setTeamBoetes(prev => prev.map(tb => {
      if (tb.cat.id !== catId) return tb;
      const next = Math.max(0, tb.aantal + delta);
      return { ...tb, aantal: next };
    }));
  }

  function setTeamBoeteBedrag(catId: string, bedrag: number) {
    setTeamBoetes(prev => prev.map(tb => {
      if (tb.cat.id !== catId) return tb;
      return { ...tb, bedrag };
    }));
  }

  function calcSpelerEigenBoetes(state: SpelerState, isDubbel: boolean, isDubbeleMaand: boolean): number {
    return normaleCats.reduce((sum, cat) => {
      const entry = state.boetes[cat.id];
      if (!entry || entry.aantal === 0) return sum;
      const bedrag = cat.open_bedrag ? (entry.bedrag ?? 0) : calcBedrag(cat, isDubbel, isDubbeleMaand);
      return sum + entry.aantal * bedrag;
    }, 0);
  }

  function calcTeamBoetesTotaal(isDubbel: boolean, isDubbeleMaand: boolean): number {
    return teamBoetes.reduce((sum, tb) => {
      if (tb.aantal === 0) return sum;
      const bedrag = tb.cat.open_bedrag ? (tb.bedrag ?? 0) : calcBedrag(tb.cat, isDubbel, isDubbeleMaand);
      return sum + tb.aantal * bedrag;
    }, 0);
  }

  async function saveProgress(partial: boolean) {
    if (!activiteit || !profile) return;
    setSaving(true);

    const isDubbel = activiteit.is_dubbel;
    const isDubbeleMaand = activiteit.is_dubbele_maand;

    // Calculate average fine over aanwezige spelers (only eigen boetes, not team boetes)
    const aanwezigen = spelers.filter(s => s.aanwezigheid === 'aanwezig');
    const eigenBoetesTotals = aanwezigen.map(s => calcSpelerEigenBoetes(s, isDubbel, isDubbeleMaand));
    const gemiddelde = aanwezigen.length > 0
      ? Math.ceil(eigenBoetesTotals.reduce((a, b) => a + b, 0) / aanwezigen.length / 100) * 100
      : 0;

    // Team boetes total (same for everyone, not in average)
    const teamTotaal = calcTeamBoetesTotaal(isDubbel, isDubbeleMaand);

    // Get ongeoorloofd-absence history per speler
    const ongeoorloordIds = spelers
      .filter(s => s.aanwezigheid === 'ongeoorloofd_afwezig')
      .map(s => s.speler.id);

    const absenceHistory: Record<string, number> = {};
    if (ongeoorloordIds.length > 0) {
      const { data: history } = await supabase
        .from('activiteit_spelers')
        .select('speler_id')
        .eq('aanwezigheid', 'ongeoorloofd_afwezig')
        .in('speler_id', ongeoorloordIds);
      for (const row of history ?? []) {
        absenceHistory[row.speler_id] = (absenceHistory[row.speler_id] ?? 0) + 1;
      }
    }

    // Save each player
    for (const state of spelers) {
      if (state.aanwezigheid === null) continue;

      let eigenBoetes = 0;
      let opslagBedrag = 0;
      let totaal = 0;

      // Eigen boetes work for ALL attendance types now
      eigenBoetes = calcSpelerEigenBoetes(state, isDubbel, isDubbeleMaand);

      if (state.aanwezigheid === 'aanwezig') {
        totaal = eigenBoetes + teamTotaal;
      } else if (state.aanwezigheid === 'geoorloofd_afwezig') {
        totaal = gemiddelde + eigenBoetes + teamTotaal;
      } else if (state.aanwezigheid === 'ongeoorloofd_afwezig') {
        const prevCount = absenceHistory[state.speler.id] ?? 0;
        const maxOngeoorloord = state.speler.max_ongeoorloord ?? 5;
        opslagBedrag = prevCount > maxOngeoorloord ? 400 : 200;
        totaal = gemiddelde + opslagBedrag + eigenBoetes + teamTotaal;
      }

      const { data: asData } = await supabase
        .from('activiteit_spelers')
        .upsert({
          activiteit_id: activiteit.id,
          speler_id: state.speler.id,
          aanwezigheid: state.aanwezigheid,
          eigen_boetes_totaal: eigenBoetes,
          gemiddeld_bedrag: state.aanwezigheid === 'aanwezig' ? 0 : gemiddelde,
          opslag_bedrag: opslagBedrag,
          totaal_bedrag: totaal,
        }, { onConflict: 'activiteit_id,speler_id' })
        .select()
        .single();

      if (asData) {
        // Save boete_items for ALL players (eigen + team)
        await supabase.from('boete_items').delete().eq('activiteit_speler_id', asData.id);

        // Eigen boetes
        const eigenItems = normaleCats
          .filter(cat => {
            const entry = state.boetes[cat.id];
            return entry && entry.aantal > 0;
          })
          .map(cat => {
            const entry = state.boetes[cat.id];
            const bedrag = cat.open_bedrag ? (entry.bedrag ?? 0) : calcBedrag(cat, isDubbel, isDubbeleMaand);
            return { activiteit_speler_id: asData.id, categorie_id: cat.id, aantal: entry.aantal, bedrag_per_stuk: bedrag, subtotaal: entry.aantal * bedrag };
          });

        // Team boetes (same for all players)
        const teamItems = teamBoetes
          .filter(tb => tb.aantal > 0)
          .map(tb => {
            const bedrag = tb.cat.open_bedrag ? (tb.bedrag ?? 0) : calcBedrag(tb.cat, isDubbel, isDubbeleMaand);
            return { activiteit_speler_id: asData.id, categorie_id: tb.cat.id, aantal: tb.aantal, bedrag_per_stuk: bedrag, subtotaal: tb.aantal * bedrag };
          });

        const allItems = [...eigenItems, ...teamItems];
        if (allItems.length > 0) await supabase.from('boete_items').insert(allItems);
      }
    }

    // Only set gewijzigd_door if the activiteit was already saved before (has gemaakt_door set)
    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      laatste_speler_index: index,
    };
    if (activiteit.gemaakt_door) {
      updateData.gewijzigd_door = profile.id;
      updateData.gewijzigd_op = now;
    } else {
      updateData.gemaakt_op = now;
    }
    if (!partial) {
      updateData.afgerond = true;
    }
    await supabase.from('activiteiten').update(updateData).eq('id', activiteit.id);
    setSaving(false);
  }

  const saveAndFinish = useCallback(async () => {
    await saveProgress(false);
    router.push(returnPath);
  }, [activiteit, spelers, categorieen, teamBoetes, router, profile, index, returnPath]);

  async function savePartialAndExit() {
    await saveProgress(true);
    router.push(returnPath);
  }

  function handleNext() {
    if (phase === 'spelers') {
      if (index < spelers.length - 1) {
        setIndex(index + 1);
      } else {
        // Move to team phase if there are team boetes
        if (teamBoetes.length > 0) {
          setPhase('team');
        }
      }
    }
  }

  function handlePrev() {
    if (phase === 'team') {
      setPhase('spelers');
      setIndex(spelers.length - 1);
    } else if (index > 0) {
      setIndex(index - 1);
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Laden...</div>;
  if (!activiteit) return <div className="text-center py-16 text-gray-400 text-sm">Niet gevonden.</div>;

  const isDubbel = activiteit.is_dubbel;
  const isDubbeleMaand = activiteit.is_dubbele_maand;
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

  // Team phase
  if (phase === 'team') {
    const teamTotaal = calcTeamBoetesTotaal(isDubbel, isDubbeleMaand);
    return (
      <div className="space-y-4 pb-28">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={handlePrev} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 truncate">{activiteit.naam}</h1>
            <p className="text-sm text-gray-500">Teamboetes - gelden voor iedereen</p>
            {(makerNaam || wijzigerNaam) && (
              <div className="flex flex-col gap-0.5 mt-1 text-xs text-gray-400">
                {makerNaam && <span>Ingevuld door <strong className="font-medium text-gray-500">{makerNaam}</strong>{makerTijd && <span className="text-gray-400 ml-1">({makerTijd})</span>}</span>}
                {wijzigerNaam && <span>Gewijzigd door <strong className="font-medium text-gray-500">{wijzigerNaam}</strong>{wijzigerTijd && <span className="text-gray-400 ml-1">({wijzigerTijd})</span>}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Team boetes card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Teamboetes</h2>
                {teamTotaal > 0 && <p className="text-purple-200 text-sm font-medium">{formatBedrag(teamTotaal)} per speler</p>}
              </div>
            </div>
          </div>

          <div className="p-5 space-y-3">
            <div className="bg-purple-50 rounded-xl px-4 py-3 text-sm text-purple-800">
              Deze boetes gelden voor alle spelers (aanwezig en afwezig) en tellen niet mee met het gemiddelde.
            </div>

            <div className="space-y-2">
              {teamBoetes.map(tb => {
                const aantal = tb.aantal;
                const customBedrag = tb.bedrag;
                const fixedBedrag = calcBedrag(tb.cat, isDubbel, isDubbeleMaand);
                const bedrag = tb.cat.open_bedrag ? (customBedrag ?? 0) : fixedBedrag;
                const isDoubled = (isDubbel && tb.cat.verdubbelbaar) || isDubbeleMaand;
                return (
                  <div key={tb.cat.id} className="bg-gray-50 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800">{tb.cat.titel || tb.cat.naam}</p>
                          {isDoubled && !tb.cat.open_bedrag && <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-1 py-0.5 rounded">x{isDubbel && tb.cat.verdubbelbaar && isDubbeleMaand ? 4 : 2}</span>}
                          {tb.cat.open_bedrag && <span className="text-xs bg-green-100 text-green-600 font-semibold px-1 py-0.5 rounded flex items-center gap-0.5"><Euro className="w-2.5 h-2.5" />Open</span>}
                        </div>
                        <p className="text-xs text-gray-400">
                          {tb.cat.open_bedrag
                            ? aantal > 0 ? `${formatBedrag(bedrag)} per stuk` : 'Bedrag invullen bij aantal'
                            : `${formatBedrag(fixedBedrag)} p.st.`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {aantal > 0 && <span className="text-xs font-bold text-purple-700">{formatBedrag(aantal * bedrag)}</span>}
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setTeamBoeteCount(tb.cat.id, -1)} disabled={aantal === 0} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold text-gray-800">{aantal}</span>
                          <button onClick={() => setTeamBoeteCount(tb.cat.id, 1)} className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 active:bg-purple-800 transition-colors">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {tb.cat.open_bedrag && aantal > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Bedrag p.st. (EUR)</label>
                        <OpenBedragInput
                          value={customBedrag}
                          onChange={val => setTeamBoeteBedrag(tb.cat.id, val)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              {teamBoetes.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">Geen teamboetes ingesteld</p>
              )}
            </div>
          </div>
        </div>

        {/* Sticky navigation buttons */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100 px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
          <div className="max-w-lg mx-auto">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={savePartialAndExit} disabled={saving} className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-sm disabled:opacity-60 text-sm">
                <CheckCircle className="w-4 h-4" />
                {saving ? 'Opslaan...' : 'Opslaan & overzicht'}
              </button>
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button onClick={handlePrev} className="w-12 flex items-center justify-center bg-gray-100 text-gray-600 rounded-2xl hover:bg-gray-200 active:bg-gray-300 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button onClick={saveAndFinish} disabled={saving} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-sm disabled:opacity-60 text-sm">
                  Afronden
                  <CheckCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Spelers phase
  if (!current) return <div className="text-center py-16 text-gray-400 text-sm">Niet gevonden.</div>;

  const eigenTotaal = calcSpelerEigenBoetes(current, isDubbel, isDubbeleMaand);

  return (
    <div className="space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/activiteit/${id}/overzicht`} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 truncate">{activiteit.naam}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-gray-500">Speler {index + 1} van {spelers.length}</p>
            {isDubbel && <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-1"><Zap className="w-3 h-3" />Dubbel</span>}
            {isDubbeleMaand && <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-1"><Calendar className="w-3 h-3" />Dubbele maand</span>}
          </div>
          {(makerNaam || wijzigerNaam) && (
            <div className="flex flex-col gap-0.5 mt-1 text-xs text-gray-400">
              {makerNaam && <span>Ingevuld door <strong className="font-medium text-gray-500">{makerNaam}</strong>{makerTijd && <span className="text-gray-400 ml-1">({makerTijd})</span>}</span>}
              {wijzigerNaam && <span>Gewijzigd door <strong className="font-medium text-gray-500">{wijzigerNaam}</strong>{wijzigerTijd && <span className="text-gray-400 ml-1">({wijzigerTijd})</span>}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${((index + 1) / spelers.length) * 100}%` }} />
      </div>

      {/* Player card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{current.speler.naam}</h2>
              {eigenTotaal > 0 && <p className="text-blue-200 text-sm font-medium">{formatBedrag(eigenTotaal)} eigen boetes</p>}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Attendance */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Aanwezigheid</p>
            <div className={`grid gap-2 ${(instellingen?.ongeoorloord_enabled ?? true) ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <AttendanceButton label="Aanwezig" icon={<UserCheck className="w-4 h-4" />} active={current.aanwezigheid === 'aanwezig'} color="green" onClick={() => setAanwezigheid('aanwezig')} />
              <AttendanceButton label="Geoorloofd" icon={<User className="w-4 h-4" />} active={current.aanwezigheid === 'geoorloofd_afwezig'} color="amber" onClick={() => setAanwezigheid('geoorloofd_afwezig')} />
              {(instellingen?.ongeoorloord_enabled ?? true) && (
                <AttendanceButton label="Ongeoorloord" icon={<UserX className="w-4 h-4" />} active={current.aanwezigheid === 'ongeoorloofd_afwezig'} color="red" onClick={() => setAanwezigheid('ongeoorloofd_afwezig')} />
              )}
            </div>
          </div>

          {/* Fine categories - shown for ALL attendance types */}
          {current.aanwezigheid !== null && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {current.aanwezigheid === 'aanwezig' ? 'Boetes' : 'Extra boetes (niet in gemiddelde)'}
              </p>
              <div className="space-y-2">
                {normaleCats.map(cat => {
                  const entry = current.boetes[cat.id];
                  const aantal = entry?.aantal ?? 0;
                  const customBedrag = entry?.bedrag;
                  const fixedBedrag = calcBedrag(cat, isDubbel, isDubbeleMaand);
                  const bedrag = cat.open_bedrag ? (customBedrag ?? 0) : fixedBedrag;
                  const isDoubled = (isDubbel && cat.verdubbelbaar) || isDubbeleMaand;
                  return (
                    <div key={cat.id} className="bg-gray-50 rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-800">{cat.titel || cat.naam}</p>
                            {isDoubled && !cat.open_bedrag && <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-1 py-0.5 rounded">x{isDubbel && cat.verdubbelbaar && isDubbeleMaand ? 4 : 2}</span>}
                            {cat.open_bedrag && <span className="text-xs bg-green-100 text-green-600 font-semibold px-1 py-0.5 rounded flex items-center gap-0.5"><Euro className="w-2.5 h-2.5" />Open</span>}
                          </div>
                          <p className="text-xs text-gray-400">
                            {cat.open_bedrag
                              ? aantal > 0 ? `${formatBedrag(bedrag)} per stuk` : 'Bedrag invullen bij aantal'
                              : `${formatBedrag(fixedBedrag)} p.st.`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {aantal > 0 && <span className="text-xs font-bold text-blue-700">{formatBedrag(aantal * bedrag)}</span>}
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setBoeteCount(cat.id, -1)} disabled={aantal === 0} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center text-sm font-bold text-gray-800">{aantal}</span>
                            <button onClick={() => setBoeteCount(cat.id, 1)} className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 transition-colors">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {cat.open_bedrag && aantal > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Bedrag p.st. (EUR)</label>
                          <OpenBedragInput
                            value={customBedrag}
                            onChange={val => setBoeteBedrag(cat.id, val)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {current.aanwezigheid === 'geoorloofd_afwezig' && (
            <div className="rounded-xl px-4 py-3 text-sm bg-amber-50 text-amber-800">
              Krijgt het gemiddelde boetebedrag van de aanwezige spelers, plus eventuele extra boetes hierboven.
            </div>
          )}
          {current.aanwezigheid === 'ongeoorloofd_afwezig' && (instellingen?.ongeoorloord_enabled ?? true) && (
            <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-red-800">
              {`Krijgt het gemiddelde + een opslag van EUR 2 (of EUR 4 bij meer dan ${current.speler.max_ongeoorloord ?? 5} keer ongeoorloord afwezig), plus eventuele extra boetes hierboven.`}
            </div>
          )}
        </div>
      </div>

      {/* Sticky navigation buttons - fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100 px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
        <div className="max-w-lg mx-auto">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={savePartialAndExit} disabled={saving} className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-sm disabled:opacity-60 text-sm">
              <CheckCircle className="w-4 h-4" />
              {saving ? 'Opslaan...' : 'Opslaan & overzicht'}
            </button>
            {index < spelers.length - 1 ? (
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button onClick={handlePrev} disabled={index === 0} className="w-12 flex items-center justify-center bg-gray-100 text-gray-600 rounded-2xl hover:bg-gray-200 active:bg-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button onClick={handleNext} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-sm text-sm">
                  Volgende
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : teamBoetes.length > 0 ? (
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button onClick={handlePrev} disabled={index === 0} className="w-12 flex items-center justify-center bg-gray-100 text-gray-600 rounded-2xl hover:bg-gray-200 active:bg-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPhase('team')} className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-sm text-sm">
                  <Users className="w-4 h-4" />
                  Teamboetes
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button onClick={handlePrev} disabled={index === 0} className="w-12 flex items-center justify-center bg-gray-100 text-gray-600 rounded-2xl hover:bg-gray-200 active:bg-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button onClick={saveAndFinish} disabled={saving} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-sm disabled:opacity-60 text-sm">
                  Afronden
                  <CheckCircle className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AttendanceButton({ label, icon, active, color, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; color: 'green' | 'amber' | 'red'; onClick: () => void;
}) {
  const colors = {
    green: active ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-700',
    amber: active ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 text-gray-600 hover:border-amber-400 hover:text-amber-700',
    red: active ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600 hover:border-red-400 hover:text-red-700',
  };
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all font-medium text-xs ${colors[color]}`}>
      {icon}
      <span className="leading-tight text-center">{label}</span>
    </button>
  );
}

function OpenBedragInput({ value, onChange }: {
  value: number | undefined;
  onChange: (cents: number) => void;
}) {
  const [text, setText] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Only sync from external value when not actively editing (e.g. initial load from DB)
  useEffect(() => {
    if (!isEditing) {
      if (value !== undefined && value > 0) {
        setText((value / 100).toFixed(2).replace('.', ','));
      } else if (!value) {
        setText('');
      }
    }
  }, [value, isEditing]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={() => setIsEditing(true)}
      onBlur={() => {
        setIsEditing(false);
        // Format on blur: "2" -> "2,00", "10,5" -> "10,50"
        const parsed = parseFloat(text.replace(',', '.'));
        if (!isNaN(parsed) && parsed > 0) {
          setText((parsed).toFixed(2).replace('.', ','));
          onChange(Math.round(parsed * 100));
        } else {
          setText('');
          onChange(0);
        }
      }}
      onChange={e => {
        const raw = e.target.value;
        setText(raw);
        const parsed = parseFloat(raw.replace(',', '.'));
        if (!isNaN(parsed)) {
          onChange(Math.round(parsed * 100));
        } else if (raw.trim() === '') {
          onChange(0);
        }
      }}
      placeholder="0,00"
      className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
    />
  );
}
