'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Activiteit, Speler, Boetecategorie, calcBedrag, formatBedrag } from '@/lib/supabase';
import { ArrowLeft, CheckCircle, Euro, Minus, Plus, User, UserCheck, UserX, Zap, Calendar } from 'lucide-react';
import Link from 'next/link';

type Aanwezigheid = 'aanwezig' | 'geoorloofd_afwezig' | 'ongeoorloofd_afwezig';

interface BoeteEntry {
  aantal: number;
  bedrag?: number; // for open_bedrag categories
}

export default function SpelerEditPage() {
  return (
    <AuthGuard>
      <AppShell>
        <SpelerEditContent />
      </AppShell>
    </AuthGuard>
  );
}

function SpelerEditContent() {
  const { id, spelerId } = useParams<{ id: string; spelerId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [activiteit, setActiviteit] = useState<Activiteit | null>(null);
  const [speler, setSpeler] = useState<Speler | null>(null);
  const [categorieen, setCategorieen] = useState<Boetecategorie[]>([]);
  const [aanwezigheid, setAanwezigheid] = useState<Aanwezigheid | null>(null);
  const [boetes, setBoetes] = useState<Record<string, BoeteEntry>>({});
  const [teamBoetes, setTeamBoetes] = useState<Record<string, BoeteEntry>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const isBeheerder = profile?.rol === 'beheerder' || profile?.rol === 'hoofdbeheerder';

  useEffect(() => { load(); }, [id, spelerId]);

  async function load() {
    const [{ data: act }, { data: sp }, { data: cats }, { data: existing }] = await Promise.all([
      supabase.from('activiteiten').select('*, gemaakt_door_profile:profiles!gemaakt_door(naam,email), gewijzigd_door_profile:profiles!gewijzigd_door(naam,email)').eq('id', id).single(),
      supabase.from('spelers').select('*').eq('id', spelerId).single(),
      supabase.from('boetecategorieen').select('*').eq('actief', true).order('volgorde'),
      supabase.from('activiteit_spelers').select('*, boete_items(*)').eq('activiteit_id', id).eq('speler_id', spelerId).maybeSingle(),
    ]);
    setActiviteit(act);
    setSpeler(sp);
    setCategorieen(cats ?? []);

    if (existing) {
      setAanwezigheid(existing.aanwezigheid);
      const eigenBoetes: Record<string, BoeteEntry> = {};
      const teamBoeteMap: Record<string, BoeteEntry> = {};
      for (const item of existing.boete_items ?? []) {
        const cat = (cats ?? []).find(c => c.id === item.categorie_id);
        if (!cat) continue;
        if (cat.is_teamboete) {
          teamBoeteMap[cat.id] = { aantal: item.aantal, bedrag: item.bedrag_per_stuk };
        } else {
          eigenBoetes[cat.id] = { aantal: item.aantal, bedrag: item.bedrag_per_stuk };
        }
      }
      setBoetes(eigenBoetes);
      setTeamBoetes(teamBoeteMap);
    }

    setLoading(false);
  }

  const isDubbel = activiteit?.is_dubbel ?? false;
  const isDubbeleMaand = activiteit?.is_dubbele_maand ?? false;
  const normaleCats = categorieen.filter(c => !c.is_teamboete);
  const teamCats = categorieen.filter(c => c.is_teamboete);

  function setBoeteCount(catId: string, delta: number) {
    setBoetes(prev => {
      const cur = prev[catId]?.aantal ?? 0;
      const next = Math.max(0, cur + delta);
      const b = { ...prev };
      if (next === 0) delete b[catId];
      else b[catId] = { aantal: next, bedrag: prev[catId]?.bedrag };
      return b;
    });
  }

  function setBoeteBedrag(catId: string, bedrag: number) {
    setBoetes(prev => {
      const cur = prev[catId];
      if (!cur) return prev;
      return { ...prev, [catId]: { ...cur, bedrag } };
    });
  }

  function setTeamBoeteCount(catId: string, delta: number) {
    setTeamBoetes(prev => {
      const cur = prev[catId]?.aantal ?? 0;
      const next = Math.max(0, cur + delta);
      const b = { ...prev };
      if (next === 0) delete b[catId];
      else b[catId] = { aantal: next, bedrag: prev[catId]?.bedrag };
      return b;
    });
  }

  function setTeamBoeteBedrag(catId: string, bedrag: number) {
    setTeamBoetes(prev => {
      const cur = prev[catId];
      if (!cur) return prev;
      return { ...prev, [catId]: { ...cur, bedrag } };
    });
  }

  function calcEigenBoetes(): number {
    return normaleCats.reduce((sum, cat) => {
      const entry = boetes[cat.id];
      if (!entry || entry.aantal === 0) return sum;
      const bedrag = cat.open_bedrag ? (entry.bedrag ?? 0) : calcBedrag(cat, isDubbel, isDubbeleMaand);
      return sum + entry.aantal * bedrag;
    }, 0);
  }

  function calcTeamTotaal(): number {
    return teamCats.reduce((sum, cat) => {
      const entry = teamBoetes[cat.id];
      if (!entry || entry.aantal === 0) return sum;
      const bedrag = cat.open_bedrag ? (entry.bedrag ?? 0) : calcBedrag(cat, isDubbel, isDubbeleMaand);
      return sum + entry.aantal * bedrag;
    }, 0);
  }

  const handleSave = useCallback(async () => {
    if (!activiteit || !speler || !aanwezigheid) return;
    setSaving(true);

    // Recalculate average from current aanwezige spelers (excluding this one being edited)
    const { data: allSpelers } = await supabase
      .from('activiteit_spelers')
      .select('*, boete_items(*)')
      .eq('activiteit_id', activiteit.id);

    const allCats = categorieen;
    const eigenBoetes = calcEigenBoetes();
    const teamTotaal = calcTeamTotaal();

    // Compute gemiddelde over aanwezige spelers (only eigen boetes, not team boetes)
    const otherAanwezigen = (allSpelers ?? []).filter(
      (s: { speler_id: string; aanwezigheid: string }) => s.aanwezigheid === 'aanwezig' && s.speler_id !== speler.id
    );
    const otherTotals = otherAanwezigen.map((s: { boete_items?: { categorie_id: string; aantal: number; bedrag_per_stuk: number }[] }) => {
      return allCats.reduce((sum: number, cat: Boetecategorie) => {
        if (cat.is_teamboete) return sum;
        const item = (s.boete_items ?? []).find((bi: { categorie_id: string }) => bi.categorie_id === cat.id);
        const aantal = item?.aantal ?? 0;
        const bedrag = cat.open_bedrag ? (item?.bedrag_per_stuk ?? 0) : calcBedrag(cat, isDubbel, isDubbeleMaand);
        return sum + aantal * bedrag;
      }, 0);
    });

    const allAanwezigTotals = aanwezigheid === 'aanwezig'
      ? [...otherTotals, eigenBoetes]
      : otherTotals;

    const gemiddelde = allAanwezigTotals.length > 0
      ? Math.ceil(allAanwezigTotals.reduce((a: number, b: number) => a + b, 0) / allAanwezigTotals.length / 100) * 100
      : 0;

    // Absence history for opslag
    let opslagBedrag = 0;
    if (aanwezigheid === 'ongeoorloofd_afwezig') {
      const { data: history } = await supabase
        .from('activiteit_spelers')
        .select('id')
        .eq('speler_id', speler.id)
        .eq('aanwezigheid', 'ongeoorloofd_afwezig');
      const prevCount = (history ?? []).length;
      const maxOngeoorloord = speler.max_ongeoorloord ?? 5;
      opslagBedrag = prevCount > maxOngeoorloord ? 400 : 200;
    }

    let totaal = 0;
    let gemiddeldBedrag = 0;
    if (aanwezigheid === 'aanwezig') {
      totaal = eigenBoetes + teamTotaal;
    } else if (aanwezigheid === 'geoorloofd_afwezig') {
      gemiddeldBedrag = gemiddelde;
      totaal = gemiddelde + eigenBoetes + teamTotaal;
    } else {
      gemiddeldBedrag = gemiddelde;
      totaal = gemiddelde + opslagBedrag + eigenBoetes + teamTotaal;
    }

    const { data: asData } = await supabase
      .from('activiteit_spelers')
      .upsert({
        activiteit_id: activiteit.id,
        speler_id: speler.id,
        aanwezigheid,
        eigen_boetes_totaal: eigenBoetes,
        gemiddeld_bedrag: gemiddeldBedrag,
        opslag_bedrag: opslagBedrag,
        totaal_bedrag: totaal,
      }, { onConflict: 'activiteit_id,speler_id' })
      .select()
      .single();

    if (asData) {
      await supabase.from('boete_items').delete().eq('activiteit_speler_id', asData.id);

      const eigenItems = normaleCats
        .filter(cat => {
          const entry = boetes[cat.id];
          return entry && entry.aantal > 0;
        })
        .map(cat => {
          const entry = boetes[cat.id];
          const bedrag = cat.open_bedrag ? (entry.bedrag ?? 0) : calcBedrag(cat, isDubbel, isDubbeleMaand);
          return { activiteit_speler_id: asData.id, categorie_id: cat.id, aantal: entry.aantal, bedrag_per_stuk: bedrag, subtotaal: entry.aantal * bedrag };
        });

      const teamItems = teamCats
        .filter(cat => {
          const entry = teamBoetes[cat.id];
          return entry && entry.aantal > 0;
        })
        .map(cat => {
          const entry = teamBoetes[cat.id];
          const bedrag = cat.open_bedrag ? (entry.bedrag ?? 0) : calcBedrag(cat, isDubbel, isDubbeleMaand);
          return { activiteit_speler_id: asData.id, categorie_id: cat.id, aantal: entry.aantal, bedrag_per_stuk: bedrag, subtotaal: entry.aantal * bedrag };
        });

      const allItems = [...eigenItems, ...teamItems];
      if (allItems.length > 0) await supabase.from('boete_items').insert(allItems);
    }

    // Update gemiddelde for all afwezige spelers in this activiteit
    const { data: refreshedSpelers } = await supabase
      .from('activiteit_spelers')
      .select('*, boete_items(*)')
      .eq('activiteit_id', activiteit.id);

    const refreshedAanwezigen = (refreshedSpelers ?? []).filter(
      (s: { aanwezigheid: string }) => s.aanwezigheid === 'aanwezig'
    );
    const refreshedTotals = refreshedAanwezigen.map((s: { boete_items?: { categorie_id: string; aantal: number; bedrag_per_stuk: number }[] }) => {
      return allCats.reduce((sum: number, cat: Boetecategorie) => {
        if (cat.is_teamboete) return sum;
        const item = (s.boete_items ?? []).find((bi: { categorie_id: string }) => bi.categorie_id === cat.id);
        const aantal = item?.aantal ?? 0;
        const bedrag = cat.open_bedrag ? (item?.bedrag_per_stuk ?? 0) : calcBedrag(cat, isDubbel, isDubbeleMaand);
        return sum + aantal * bedrag;
      }, 0);
    });
    const newGemiddelde = refreshedTotals.length > 0
      ? Math.ceil(refreshedTotals.reduce((a: number, b: number) => a + b, 0) / refreshedTotals.length / 100) * 100
      : 0;

    const afwezigen = (refreshedSpelers ?? []).filter(
      (s: { aanwezigheid: string; speler_id: string }) =>
        (s.aanwezigheid === 'geoorloofd_afwezig' || s.aanwezigheid === 'ongeoorloofd_afwezig') && s.speler_id !== speler.id
    );
    for (const afw of afwezigen) {
      const afwEigen = allCats.reduce((sum: number, cat: Boetecategorie) => {
        if (cat.is_teamboete) return sum;
        const item = (afw.boete_items ?? []).find((bi: { categorie_id: string }) => bi.categorie_id === cat.id);
        const aantal = item?.aantal ?? 0;
        const bedrag = cat.open_bedrag ? (item?.bedrag_per_stuk ?? 0) : calcBedrag(cat, isDubbel, isDubbeleMaand);
        return sum + aantal * bedrag;
      }, 0);
      const afwTeam = allCats.reduce((sum: number, cat: Boetecategorie) => {
        if (!cat.is_teamboete) return sum;
        const item = (afw.boete_items ?? []).find((bi: { categorie_id: string }) => bi.categorie_id === cat.id);
        const aantal = item?.aantal ?? 0;
        const bedrag = cat.open_bedrag ? (item?.bedrag_per_stuk ?? 0) : calcBedrag(cat, isDubbel, isDubbeleMaand);
        return sum + aantal * bedrag;
      }, 0);
      const afwOpslag = afw.opslag_bedrag ?? 0;
      const afwTotaal = newGemiddelde + afwEigen + afwTeam + afwOpslag;
      await supabase.from('activiteit_spelers').update({
        gemiddeld_bedrag: newGemiddelde,
        totaal_bedrag: afwTotaal,
      }).eq('id', afw.id);
    }

    if (profile) {
      const now = new Date().toISOString();
      const updateData: Record<string, any> = { gewijzigd_door: profile.id, gewijzigd_op: now };
      if (!activiteit.gemaakt_door) {
        updateData.gemaakt_op = now;
      }
      await supabase.from('activiteiten').update(updateData).eq('id', activiteit.id);
    }

    setSaving(false);
    router.push(`/activiteit/${id}/overzicht`);
  }, [activiteit, speler, aanwezigheid, boetes, teamBoetes, categorieen, id, router, profile, isDubbel, isDubbeleMaand, normaleCats, teamCats]);

  const eigenTotaal = calcEigenBoetes();

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Laden...</div>;
  if (!activiteit || !speler) return <div className="text-center py-16 text-gray-400 text-sm">Niet gevonden.</div>;

  return (
    <div className="space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <Link href={`/activiteit/${id}/overzicht`} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900">{speler.naam}</h1>
          <p className="text-sm text-gray-500">{activiteit.naam}</p>
          {(() => {
            const makerNaam = activiteit.gemaakt_door_profile?.naam || activiteit.gemaakt_door_profile?.email || null;
            const wijzigerNaam = activiteit.gewijzigd_door_profile?.naam || activiteit.gewijzigd_door_profile?.email || null;
            const formatTs = (ts: string | null | undefined) => {
              if (!ts) return '';
              const d = new Date(ts);
              const dd = String(d.getDate()).padStart(2, '0');
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const yyyy = d.getFullYear();
              const hh = String(d.getHours()).padStart(2, '0');
              const min = String(d.getMinutes()).padStart(2, '0');
              return `${dd}-${mm}-${yyyy} / ${hh}:${min}`;
            };
            const makerTijd = formatTs(activiteit.gemaakt_op);
            const wijzigerTijd = formatTs(activiteit.gewijzigd_op);
            if (!makerNaam && !wijzigerNaam) return null;
            return (
              <div className="flex flex-col gap-0.5 mt-1 text-xs text-gray-400">
                {makerNaam && <span>Ingevuld door <strong className="font-medium text-gray-500">{makerNaam}</strong>{makerTijd && <span className="text-gray-400 ml-1">({makerTijd})</span>}</span>}
                {wijzigerNaam && <span>Gewijzigd door <strong className="font-medium text-gray-500">{wijzigerNaam}</strong>{wijzigerTijd && <span className="text-gray-400 ml-1">({wijzigerTijd})</span>}</span>}
              </div>
            );
          })()}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{speler.naam}</h2>
              {eigenTotaal > 0 && aanwezigheid === 'aanwezig' && (
                <p className="text-blue-200 text-sm font-medium">{formatBedrag(eigenTotaal)} eigen boetes</p>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                {isDubbel && <span className="inline-flex items-center gap-1 text-xs bg-orange-400/30 text-orange-100 font-semibold px-2 py-0.5 rounded-full"><Zap className="w-3 h-3" />Dubbel</span>}
                {isDubbeleMaand && <span className="inline-flex items-center gap-1 text-xs bg-purple-400/30 text-purple-100 font-semibold px-2 py-0.5 rounded-full"><Calendar className="w-3 h-3" />Dubbele maand</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Aanwezigheid</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'aanwezig' as Aanwezigheid, label: 'Aanwezig', icon: <UserCheck className="w-4 h-4" />, color: 'green' as const },
                { value: 'geoorloofd_afwezig' as Aanwezigheid, label: 'Geoorloofd', icon: <User className="w-4 h-4" />, color: 'amber' as const },
                { value: 'ongeoorloofd_afwezig' as Aanwezigheid, label: 'Ongeoorloord', icon: <UserX className="w-4 h-4" />, color: 'red' as const },
              ].map(opt => {
                const colors = { green: opt.value === aanwezigheid ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600', amber: opt.value === aanwezigheid ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 text-gray-600', red: opt.value === aanwezigheid ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600' };
                return (
                  <button key={opt.value} onClick={() => isBeheerder && setAanwezigheid(opt.value)} className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all font-medium text-xs ${colors[opt.color]}`}>
                    {opt.icon}
                    <span className="leading-tight text-center">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {aanwezigheid !== null && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {aanwezigheid === 'aanwezig' ? 'Boetes' : 'Extra boetes (niet in gemiddelde)'}
              </p>
              <div className="space-y-2">
                {normaleCats.map(cat => {
                  const entry = boetes[cat.id];
                  const aantal = entry?.aantal ?? 0;
                  const customBedrag = entry?.bedrag;
                  const fixedBedrag = calcBedrag(cat, isDubbel, isDubbeleMaand);
                  const bedrag = cat.open_bedrag ? (customBedrag ?? 0) : fixedBedrag;
                  const isDoubled = (isDubbel && cat.verdubbelbaar) || isDubbeleMaand;
                  return (
                    <div key={cat.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800">{cat.titel || cat.naam}</p>
                          {isDoubled && !cat.open_bedrag && <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-1 py-0.5 rounded">x{isDubbel && cat.verdubbelbaar && isDubbeleMaand ? 4 : 2}</span>}
                          {cat.open_bedrag && <span className="text-xs bg-green-100 text-green-600 font-semibold px-1 py-0.5 rounded flex items-center gap-0.5"><Euro className="w-2.5 h-2.5" />Open</span>}
                        </div>
                        {cat.titel && cat.titel !== cat.naam ? (
                          <p className="text-xs text-gray-400">{cat.naam}</p>
                        ) : (
                          <p className="text-xs text-gray-400">
                            {cat.open_bedrag
                              ? aantal > 0 ? `${formatBedrag(bedrag)} per stuk` : 'Bedrag invullen bij aantal'
                              : `${formatBedrag(fixedBedrag)} p.st.`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {aantal > 0 && <span className="text-xs font-bold text-blue-700">{formatBedrag(aantal * bedrag)}</span>}
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setBoeteCount(cat.id, -1)} disabled={aantal === 0} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold text-gray-800">{aantal}</span>
                          <button onClick={() => setBoeteCount(cat.id, 1)} className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
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

          {aanwezigheid !== null && teamCats.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Teamboetes (geldt voor iedereen)</p>
              <div className="space-y-2">
                {teamCats.map(cat => {
                  const entry = teamBoetes[cat.id];
                  const aantal = entry?.aantal ?? 0;
                  const customBedrag = entry?.bedrag;
                  const fixedBedrag = calcBedrag(cat, isDubbel, isDubbeleMaand);
                  const bedrag = cat.open_bedrag ? (customBedrag ?? 0) : fixedBedrag;
                  const isDoubled = (isDubbel && cat.verdubbelbaar) || isDubbeleMaand;
                  return (
                    <div key={cat.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800">{cat.titel || cat.naam}</p>
                          {isDoubled && !cat.open_bedrag && <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-1 py-0.5 rounded">x{isDubbel && cat.verdubbelbaar && isDubbeleMaand ? 4 : 2}</span>}
                          {cat.open_bedrag && <span className="text-xs bg-green-100 text-green-600 font-semibold px-1 py-0.5 rounded flex items-center gap-0.5"><Euro className="w-2.5 h-2.5" />Open</span>}
                        </div>
                        {cat.titel && cat.titel !== cat.naam ? (
                          <p className="text-xs text-gray-400">{cat.naam}</p>
                        ) : (
                          <p className="text-xs text-gray-400">
                            {cat.open_bedrag
                              ? aantal > 0 ? `${formatBedrag(bedrag)} per stuk` : 'Bedrag invullen bij aantal'
                              : `${formatBedrag(fixedBedrag)} p.st.`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {aantal > 0 && <span className="text-xs font-bold text-blue-700">{formatBedrag(aantal * bedrag)}</span>}
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setTeamBoeteCount(cat.id, -1)} disabled={aantal === 0} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold text-gray-800">{aantal}</span>
                          <button onClick={() => setTeamBoeteCount(cat.id, 1)} className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {cat.open_bedrag && aantal > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Bedrag p.st. (EUR)</label>
                          <OpenBedragInput
                            value={customBedrag}
                            onChange={val => setTeamBoeteBedrag(cat.id, val)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {aanwezigheid === 'geoorloofd_afwezig' && (
            <div className="rounded-xl px-4 py-3 text-sm bg-amber-50 text-amber-800">
              Krijgt het gemiddelde boetebedrag van de aanwezige spelers, plus eventuele extra boetes hierboven.
            </div>
          )}
          {aanwezigheid === 'ongeoorloofd_afwezig' && (
            <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-red-800">
              {`Krijgt het gemiddelde + een opslag van EUR 2 (of EUR 4 bij meer dan ${speler.max_ongeoorloord ?? 5} keer ongeoorloord afwezig), plus eventuele extra boetes hierboven.`}
            </div>
          )}
        </div>
      </div>

      {isBeheerder && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100 px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
          <div className="max-w-lg mx-auto">
            <button
              onClick={handleSave}
              disabled={saving || !aanwezigheid}
              className="w-full flex items-center justify-center gap-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-sm disabled:opacity-60 text-sm"
            >
              <CheckCircle className="w-5 h-5" />
              {saving ? 'Opslaan...' : 'Opslaan & naar overzicht'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OpenBedragInput({ value, onChange }: {
  value: number | undefined;
  onChange: (cents: number) => void;
}) {
  const [text, setText] = useState('');
  const [isEditing, setIsEditing] = useState(false);

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
