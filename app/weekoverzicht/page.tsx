'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Activiteit, ActiviteitSpeler, Profile, Speler, formatBedrag } from '@/lib/supabase';
import { BarChart3, ChevronDown, ChevronUp, ChevronRight, User, Wallet, ListOrdered, Trophy } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO, getISOWeek, getISOWeekYear } from 'date-fns';
import { nl } from 'date-fns/locale';

// Boeteweek runs from Saturday through Friday (7 days).
// Week number = ISO week number of the Saturday that starts the boeteweek.
function getBoeteweekKey(dateStr: string): string {
  const date = parseISO(dateStr);
  const day = date.getDay(); // 0=Sun, 6=Sat
  let saturday: Date;
  if (day === 6) {
    saturday = date;
  } else {
    saturday = new Date(date);
    saturday.setDate(date.getDate() - (day === 0 ? 1 : day + 1));
  }
  const weekNr = getISOWeek(saturday);
  const year = getISOWeekYear(saturday);
  return `${year}-W${String(weekNr).padStart(2, '0')}`;
}

function getBoeteweekRange(weekKey: string): { start: Date; end: Date; label: string } {
  const [yearStr, weekStr] = weekKey.split('-W');
  const year = parseInt(yearStr);
  const weekNr = parseInt(weekStr);
  // Find the Saturday of this ISO week that starts the boeteweek
  // ISO weeks start Monday. Saturday is day 6 of the ISO week.
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay(); // 0=Sun, 1=Mon
  const isoWeek1Monday = new Date(jan4);
  isoWeek1Monday.setDate(jan4.getDate() - ((jan4Day + 6) % 7));
  const weekMonday = new Date(isoWeek1Monday);
  weekMonday.setDate(isoWeek1Monday.getDate() + (weekNr - 1) * 7);
  const start = new Date(weekMonday);
  start.setDate(weekMonday.getDate() + 5); // Saturday
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Friday
  const fmt = (d: Date) => format(d, 'dd-MM-yyyy');
  return { start, end, label: `Week ${weekNr}: ${fmt(start)} t/m ${fmt(end)}` };
}

interface AlleBoetesWeekData {
  weekKey: string;
  weekLabel: string;
  spelers: {
    speler: Speler;
    activiteiten: {
      activiteit: Activiteit;
      items: { naam: string; aantal: number; subtotaal: number }[];
      gemiddeld: number;
      opslag: number;
      totaal: number;
    }[];
    spelerTotaal: number;
  }[];
  weekTotaal: number;
}

export default function WeekoverzichtPage() {
  return (
    <AuthGuard>
      <AppShell>
        <WeekoverzichtContent />
      </AppShell>
    </AuthGuard>
  );
}

function WeekoverzichtContent() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'activiteiten' | 'mijn-boete' | 'alle-boetes'>('activiteiten');
  const [loading, setLoading] = useState(true);

  useEffect(() => { setLoading(false); }, []);

  return (
    <div className="space-y-5">
      <div>
          <h1 className="text-xl font-bold text-gray-900">Boetes</h1>
          <p className="text-sm text-gray-500">Overzicht van alle activiteiten en boetes</p>
        </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <TabButton active={tab === 'activiteiten'} onClick={() => setTab('activiteiten')} icon={<BarChart3 className="w-4 h-4" />} label="Activiteiten" />
        <TabButton active={tab === 'mijn-boete'} onClick={() => setTab('mijn-boete')} icon={<Wallet className="w-4 h-4" />} label="Mijn Boetes" />
        <TabButton active={tab === 'alle-boetes'} onClick={() => setTab('alle-boetes')} icon={<ListOrdered className="w-4 h-4" />} label="Alle Boetes" />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : tab === 'activiteiten' ? (
        <ActiviteitenTab />
      ) : tab === 'mijn-boete' ? (
        <MijnBoeteTab profile={profile} />
      ) : (
        <AlleBoetesTab />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-colors ${
        active ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================
// ACTIVITEITEN TAB
// ============================================================
function ActiviteitenTab() {
  const [activiteiten, setActiviteiten] = useState<(Activiteit & { totaal?: number; count?: number })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('activiteiten')
      .select('*, gemaakt_door_profile:profiles!gemaakt_door(naam,email), gewijzigd_door_profile:profiles!gewijzigd_door(naam,email)')
      .eq('afgerond', true)
      .order('datum', { ascending: false });

    if (data) {
      const withTotals = await Promise.all(
        data.map(async (a: any) => {
          const { data: spelers } = await supabase
            .from('activiteit_spelers')
            .select('totaal_bedrag')
            .eq('activiteit_id', a.id);
          const totaal = spelers?.reduce((sum: number, s: any) => sum + s.totaal_bedrag, 0) ?? 0;
          return { ...a, totaal, count: spelers?.length ?? 0 };
        })
      );
      setActiviteiten(withTotals);
    }
    setLoading(false);
  }

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-3">
      {activiteiten.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Geen afgeronde activiteiten</p>
        </div>
      )}
      {activiteiten.map(a => {
        const datum = a.datum ? format(parseISO(a.datum), 'EEE d MMM. yyyy', { locale: nl }) : '';
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
        const makerTijd = formatTimestamp(a.gemaakt_op);
        const wijzigerTijd = formatTimestamp(a.gewijzigd_op);
        return (
          <Link
            key={a.id}
            href={`/activiteit/${a.id}/overzicht?from=boetes`}
            className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900 truncate">{a.naam}</p>
                {a.is_dubbel && <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-1.5 py-0.5 rounded-md">x2</span>}
                {a.is_dubbele_maand && <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-1.5 py-0.5 rounded-md">Dubbele maand</span>}
              </div>
              <p className="text-xs text-gray-400 capitalize">{datum}</p>
              {a.gemaakt_door_profile && (
                <p className="text-xs text-gray-400 mt-0.5">Ingevuld door: <strong className="font-medium text-gray-500">{a.gemaakt_door_profile.naam || a.gemaakt_door_profile.email}</strong>{makerTijd && <span className="text-gray-400 ml-1">({makerTijd})</span>}</p>
              )}
              {a.gewijzigd_door_profile && (
                <p className="text-xs text-gray-400">Gewijzigd door: <strong className="font-medium text-gray-500">{a.gewijzigd_door_profile.naam || a.gewijzigd_door_profile.email}</strong>{wijzigerTijd && <span className="text-gray-400 ml-1">({wijzigerTijd})</span>}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {a.totaal !== undefined && a.totaal > 0 && <span className="text-base font-bold text-blue-700">{formatBedrag(a.totaal)}</span>}
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ============================================================
// MIJN BOETES TAB
// ============================================================
interface MijnWeekData {
  weekKey: string;
  weekLabel: string;
  activiteiten: {
    activiteit: Activiteit;
    items: { naam: string; aantal: number; subtotaal: number }[];
    gemiddeld: number;
    opslag: number;
    totaal: number;
  }[];
  weekTotaal: number;
}

function MijnBoeteTab({ profile }: { profile: Profile | null }) {
  const [weken, setWeken] = useState<MijnWeekData[]>([]);
  const [loading, setLoading] = useState(true);
  const [spelerId, setSpelerId] = useState<string | null>(null);
  const [spelerNaam, setSpelerNaam] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [expandedAct, setExpandedAct] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    load();
  }, [profile]);

  async function load() {
    const { data: speler } = await supabase
      .from('spelers')
      .select('id, naam')
      .eq('profile_id', profile!.id)
      .maybeSingle();

    if (!speler) {
      setLoading(false);
      return;
    }

    setSpelerId(speler.id);
    setSpelerNaam(speler.naam);

    const { data: actSpelers } = await supabase
      .from('activiteit_spelers')
      .select(`
        *,
        activiteiten!inner(datum, naam, is_dubbel, is_dubbele_maand),
        boete_items(*, boetecategorieen(*))
      `)
      .eq('speler_id', speler.id);

    const { data: overige } = await supabase
      .from('overige_boetes')
      .select('*')
      .eq('speler_id', speler.id)
      .order('datum', { ascending: false });

    const weekMap = new Map<string, MijnWeekData>();

    for (const as of actSpelers ?? []) {
      const act = as.activiteiten as any;
      if (!act) continue;
      const weekKey = getBoeteweekKey(act.datum);
      if (!weekMap.has(weekKey)) {
        const range = getBoeteweekRange(weekKey);
        weekMap.set(weekKey, { weekKey, weekLabel: range.label, activiteiten: [], weekTotaal: 0 });
      }
      const wd = weekMap.get(weekKey)!;
      const items = (as.boete_items ?? []).map((bi: any) => ({
        naam: bi.boetecategorieen?.naam ?? 'Onbekend',
        aantal: bi.aantal,
        subtotaal: bi.subtotaal,
      }));
      wd.activiteiten.push({
        activiteit: act,
        items,
        gemiddeld: as.gemiddeld_bedrag,
        opslag: as.opslag_bedrag,
        totaal: as.totaal_bedrag,
      });
      wd.weekTotaal += as.totaal_bedrag;
    }

    for (const ob of overige ?? []) {
      const weekKey = getBoeteweekKey(ob.datum);
      if (!weekMap.has(weekKey)) {
        const range = getBoeteweekRange(weekKey);
        weekMap.set(weekKey, { weekKey, weekLabel: range.label, activiteiten: [], weekTotaal: 0 });
      }
      const wd = weekMap.get(weekKey)!;
      wd.activiteiten.push({
        activiteit: { id: ob.id, naam: ob.omschrijving, datum: ob.datum, is_dubbel: false, is_dubbele_maand: false, afgerond: true, created_at: '' } as Activiteit,
        items: [{ naam: ob.omschrijving, aantal: 1, subtotaal: ob.bedrag }],
        gemiddeld: 0,
        opslag: 0,
        totaal: ob.bedrag,
      });
      wd.weekTotaal += ob.bedrag;
    }

    const sorted = Array.from(weekMap.values()).sort((a, b) => b.weekKey.localeCompare(a.weekKey));
    for (const wd of sorted) {
      wd.activiteiten.sort((a, b) => b.activiteit.datum.localeCompare(a.activiteit.datum));
    }

    setWeken(sorted);
    setLoading(false);
  }

  if (loading) return <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>;

  if (!spelerId) {
    return (
      <div className="text-center py-12 text-gray-400">
        <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium text-sm">Niet gekoppeld aan een speler</p>
        <p className="text-xs mt-1">Vraag de hoofdbeheerder om je account te koppelen aan je spelerprofiel.</p>
      </div>
    );
  }

  if (weken.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium text-sm">Geen boetes gevonden</p>
        <p className="text-xs mt-1">Er staan nog geen boetes op je naam.</p>
      </div>
    );
  }

  const grandTotal = weken.reduce((sum, w) => sum + w.weekTotaal, 0);

  return (
    <div className="space-y-3">
      <div className="bg-blue-600 text-white rounded-2xl p-5 flex items-center gap-4">
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <p className="text-blue-200 text-sm font-medium">Totaal {spelerNaam ?? 'mijn boetes'}</p>
          <p className="text-3xl font-bold">{formatBedrag(grandTotal)}</p>
        </div>
      </div>

      {weken.map(week => (
        <div key={week.weekKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setExpandedWeek(expandedWeek === week.weekKey ? null : week.weekKey)}
            className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">{week.weekLabel}</p>
              <p className="text-xs text-gray-400">{week.activiteiten.length} activiteit{week.activiteiten.length !== 1 ? 'en' : ''}</p>
            </div>
            <span className="text-base font-bold text-blue-700">{formatBedrag(week.weekTotaal)}</span>
            {expandedWeek === week.weekKey ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {expandedWeek === week.weekKey && (
            <div className="border-t border-gray-50">
              {week.activiteiten.map((act, i) => {
                const actKey = `${week.weekKey}-${i}`;
                const datum = format(parseISO(act.activiteit.datum), 'EEE d MMM', { locale: nl });
                return (
                  <div key={i} className="border-t border-gray-100">
                    <button
                      onClick={() => setExpandedAct(expandedAct === actKey ? null : actKey)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-700">{act.activiteit.naam}</p>
                        <p className="text-xs text-gray-400 capitalize">{datum}</p>
                      </div>
                      <span className="text-xs font-bold text-gray-700">{formatBedrag(act.totaal)}</span>
                      {expandedAct === actKey ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                    </button>

                    {expandedAct === actKey && (
                      <div className="px-6 pb-3 space-y-1">
                        {act.items.map((item, j) => (
                          <div key={j} className="flex justify-between text-xs">
                            <span className="text-gray-500">{item.aantal}x {item.naam}</span>
                            <span className="font-semibold text-gray-700">{formatBedrag(item.subtotaal)}</span>
                          </div>
                        ))}
                        {act.gemiddeld > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Gemiddelde</span>
                            <span className="font-semibold text-gray-700">{formatBedrag(act.gemiddeld)}</span>
                          </div>
                        )}
                        {act.opslag > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-red-600">Ongeoorloofd</span>
                            <span className="font-semibold text-red-700">{formatBedrag(act.opslag)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
                          <span className="font-bold text-gray-900">Totaal</span>
                          <span className="font-bold text-blue-700">{formatBedrag(act.totaal)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="px-4 py-3 bg-blue-50 flex justify-between text-sm">
                <span className="font-bold text-gray-900">Totaal {week.weekLabel}</span>
                <span className="font-bold text-blue-700">{formatBedrag(week.weekTotaal)}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// ALLE BOETES TAB
// ============================================================
function FinePodium({ spelers }: { spelers: { speler: Speler; totaal: number }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-amber-500" />
        <p className="text-sm font-semibold text-gray-900">Meeste boetes</p>
      </div>
      <div className="grid grid-cols-3 gap-2 items-end">
        {spelers.map((entry, index) => (
          <div key={entry.speler.id} className={`text-center ${index === 0 ? 'order-2' : index === 1 ? 'order-1' : 'order-3'}`}>
            <div className={`mx-auto mb-1 flex items-center justify-center rounded-full font-bold text-sm ${index === 0 ? 'w-10 h-10 bg-amber-100 text-amber-700' : 'w-8 h-8 bg-gray-100 text-gray-600'}`}>{index + 1}</div>
            <p className="text-xs font-semibold text-gray-800 truncate">{entry.speler.naam}</p>
            <p className="text-[11px] text-gray-400">{formatBedrag(entry.totaal)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlleBoetesTab() {
  const [weken, setWeken] = useState<AlleBoetesWeekData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [expandedSpeler, setExpandedSpeler] = useState<string | null>(null);
  const [expandedAct, setExpandedAct] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: acts } = await supabase
      .from('activiteiten')
      .select('*')
      .eq('afgerond', true)
      .order('datum', { ascending: false });

    if (!acts || acts.length === 0) {
      setLoading(false);
      return;
    }

    const { data: allSpelers } = await supabase
      .from('activiteit_spelers')
      .select(`
        *,
        spelers(*),
        activiteiten!inner(datum, naam, is_dubbel, is_dubbele_maand),
        boete_items(*, boetecategorieen(*))
      `)
      .in('activiteit_id', acts.map(a => a.id));

    const { data: overige } = await supabase
      .from('overige_boetes')
      .select('*, spelers(*)')
      .order('datum', { ascending: false });

    // Group by boeteweek
    const weekMap = new Map<string, AlleBoetesWeekData>();

    for (const as of allSpelers ?? []) {
      const act = as.activiteiten as any;
      if (!act) continue;
      const weekKey = getBoeteweekKey(act.datum);
      if (!weekMap.has(weekKey)) {
        const range = getBoeteweekRange(weekKey);
        weekMap.set(weekKey, { weekKey, weekLabel: range.label, spelers: [], weekTotaal: 0 });
      }
      const wd = weekMap.get(weekKey)!;
      const speler = as.spelers as Speler;
      let spelerEntry = wd.spelers.find(s => s.speler.id === speler.id);
      if (!spelerEntry) {
        spelerEntry = { speler, activiteiten: [], spelerTotaal: 0 };
        wd.spelers.push(spelerEntry);
      }
      const items = (as.boete_items ?? []).map((bi: any) => ({
        naam: bi.boetecategorieen?.naam ?? 'Onbekend',
        aantal: bi.aantal,
        subtotaal: bi.subtotaal,
      }));
      spelerEntry.activiteiten.push({
        activiteit: act,
        items,
        gemiddeld: as.gemiddeld_bedrag,
        opslag: as.opslag_bedrag,
        totaal: as.totaal_bedrag,
      });
      spelerEntry.spelerTotaal += as.totaal_bedrag;
      wd.weekTotaal += as.totaal_bedrag;
    }

    // Add overige boetes
    for (const ob of overige ?? []) {
      const weekKey = getBoeteweekKey(ob.datum);
      if (!weekMap.has(weekKey)) {
        const range = getBoeteweekRange(weekKey);
        weekMap.set(weekKey, { weekKey, weekLabel: range.label, spelers: [], weekTotaal: 0 });
      }
      const wd = weekMap.get(weekKey)!;
      const speler = ob.spelers as Speler;
      let spelerEntry = wd.spelers.find(s => s.speler.id === speler.id);
      if (!spelerEntry) {
        spelerEntry = { speler, activiteiten: [], spelerTotaal: 0 };
        wd.spelers.push(spelerEntry);
      }
      spelerEntry.activiteiten.push({
        activiteit: { id: ob.id, naam: ob.omschrijving, datum: ob.datum, is_dubbel: false, is_dubbele_maand: false, afgerond: true, created_at: '' } as Activiteit,
        items: [{ naam: ob.omschrijving, aantal: 1, subtotaal: ob.bedrag }],
        gemiddeld: 0,
        opslag: 0,
        totaal: ob.bedrag,
      });
      spelerEntry.spelerTotaal += ob.bedrag;
      wd.weekTotaal += ob.bedrag;
    }

    // Sort: oldest week at bottom, newest at top
    const sorted = Array.from(weekMap.values()).sort((a, b) => b.weekKey.localeCompare(a.weekKey));
    for (const wd of sorted) {
      wd.spelers.sort((a, b) => b.spelerTotaal - a.spelerTotaal);
      for (const sp of wd.spelers) {
        sp.activiteiten.sort((a, b) => b.activiteit.datum.localeCompare(a.activiteit.datum));
      }
    }

    setWeken(sorted);
    setLoading(false);
  }

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}</div>;

  if (weken.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <ListOrdered className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Geen boetes gevonden</p>
      </div>
    );
  }

  const grandTotal = weken.reduce((sum, w) => sum + w.weekTotaal, 0);

  const podiumMap = new Map<string, { speler: Speler; totaal: number }>();
  for (const w of weken) {
    for (const sp of w.spelers) {
      const cur = podiumMap.get(sp.speler.id);
      if (cur) cur.totaal += sp.spelerTotaal;
      else podiumMap.set(sp.speler.id, { speler: sp.speler, totaal: sp.spelerTotaal });
    }
  }
  const podiumSpelers = Array.from(podiumMap.values()).sort((a, b) => b.totaal - a.totaal).slice(0, 3);

  return (
    <div className="space-y-3">
      {podiumSpelers.length > 0 && <FinePodium spelers={podiumSpelers} />}
      <div className="bg-blue-600 text-white rounded-2xl p-5 flex items-center gap-4">
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
          <ListOrdered className="w-6 h-6" />
        </div>
        <div>
          <p className="text-blue-200 text-sm font-medium">Totaal alle boetes</p>
          <p className="text-3xl font-bold">{formatBedrag(grandTotal)}</p>
        </div>
      </div>

      {weken.map(week => (
        <div key={week.weekKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setExpandedWeek(expandedWeek === week.weekKey ? null : week.weekKey)}
            className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">{week.weekLabel}</p>
              <p className="text-xs text-gray-400">{week.spelers.length} spelers</p>
            </div>
            <span className="text-base font-bold text-blue-700">{formatBedrag(week.weekTotaal)}</span>
            {expandedWeek === week.weekKey ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {expandedWeek === week.weekKey && (
            <div className="border-t border-gray-50">
              {week.spelers.map(sp => {
                const spelerKey = `${week.weekKey}-${sp.speler.id}`;
                return (
                  <div key={sp.speler.id} className="border-b border-gray-50 last:border-0">
                    <button
                      onClick={() => setExpandedSpeler(expandedSpeler === spelerKey ? null : spelerKey)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-800">{sp.speler.naam}</span>
                      <span className="text-sm font-bold text-gray-700">{formatBedrag(sp.spelerTotaal)}</span>
                      {expandedSpeler === spelerKey ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                    </button>

                    {expandedSpeler === spelerKey && (
                      <div className="bg-gray-50">
                        {sp.activiteiten.map((act, i) => {
                          const actKey = `${spelerKey}-${i}`;
                          const datum = format(parseISO(act.activiteit.datum), 'EEE d MMM', { locale: nl });
                          return (
                            <div key={i} className="border-t border-gray-100">
                              <button
                                onClick={() => setExpandedAct(expandedAct === actKey ? null : actKey)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-100 transition-colors"
                              >
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-gray-700">{act.activiteit.naam}</p>
                                  <p className="text-xs text-gray-400 capitalize">{datum}</p>
                                </div>
                                <span className="text-xs font-bold text-gray-700">{formatBedrag(act.totaal)}</span>
                                {expandedAct === actKey ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                              </button>

                              {expandedAct === actKey && (
                                <div className="px-6 pb-3 space-y-1">
                                  {act.items.map((item, j) => (
                                    <div key={j} className="flex justify-between text-xs">
                                      <span className="text-gray-500">{item.aantal}x {item.naam}</span>
                                      <span className="font-semibold text-gray-700">{formatBedrag(item.subtotaal)}</span>
                                    </div>
                                  ))}
                                  {act.gemiddeld > 0 && (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-gray-500">Gemiddelde</span>
                                      <span className="font-semibold text-gray-700">{formatBedrag(act.gemiddeld)}</span>
                                    </div>
                                  )}
                                  {act.opslag > 0 && (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-red-600">Ongeoorloofd</span>
                                      <span className="font-semibold text-red-700">{formatBedrag(act.opslag)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
                                    <span className="font-bold text-gray-900">Totaal</span>
                                    <span className="font-bold text-blue-700">{formatBedrag(act.totaal)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="px-6 py-2 border-t border-gray-200 flex justify-between text-xs">
                          <span className="font-bold text-gray-900">Totaal {sp.speler.naam}</span>
                          <span className="font-bold text-blue-700">{formatBedrag(sp.spelerTotaal)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="px-4 py-3 bg-blue-50 flex justify-between text-sm">
                <span className="font-bold text-gray-900">Totaal {week.weekLabel}</span>
                <span className="font-bold text-blue-700">{formatBedrag(week.weekTotaal)}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

