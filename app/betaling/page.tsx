'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Speler, Betaling, BetaalStatus, BankScreenshot, formatBedrag, AppInstellingen, Boetecategorie, BOETEPOT_PREFIX, extractBoetepotBasis } from '@/lib/supabase';
import { CreditCard, ChevronDown, ChevronUp, User, Check, Clock, X, AlertCircle, Wallet, Link2, Camera, Pencil, ArrowUpRight, BarChart3, Trophy } from 'lucide-react';
import AfgerondTab from './AfgerondTab';
import { format, parseISO, getISOWeek, getISOWeekYear } from 'date-fns';
import { nl } from 'date-fns/locale';

function getBoeteweekKey(dateStr: string): string {
  const date = parseISO(dateStr);
  const day = date.getDay();
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

function getBoeteweekRange(weekKey: string): { start: Date; end: Date; label: string; weekNr: number } {
  const [yearStr, weekStr] = weekKey.split('-W');
  const year = parseInt(yearStr);
  const weekNr = parseInt(weekStr);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay();
  const isoWeek1Monday = new Date(jan4);
  isoWeek1Monday.setDate(jan4.getDate() - ((jan4Day + 6) % 7));
  const weekMonday = new Date(isoWeek1Monday);
  weekMonday.setDate(isoWeek1Monday.getDate() + (weekNr - 1) * 7);
  const start = new Date(weekMonday);
  start.setDate(weekMonday.getDate() + 5);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => format(d, 'dd-MM-yyyy');
  return { start, end, label: `Week ${weekNr}: ${fmt(start)} t/m ${fmt(end)}`, weekNr };
}

function getPreviousWeekKey(weekKey: string): string {
  const range = getBoeteweekRange(weekKey);
  const prevSaturday = new Date(range.start);
  prevSaturday.setDate(range.start.getDate() - 7);
  const day = prevSaturday.getDay();
  let saturday: Date;
  if (day === 6) {
    saturday = prevSaturday;
  } else {
    saturday = new Date(prevSaturday);
    saturday.setDate(prevSaturday.getDate() - (day === 0 ? 1 : day + 1));
  }
  const weekNr = getISOWeek(saturday);
  const year = getISOWeekYear(saturday);
  return `${year}-W${String(weekNr).padStart(2, '0')}`;
}

function getCurrentBoeteweekKey(): string {
  const now = new Date();
  return getBoeteweekKey(now.toISOString());
}

function getPayableWeekKey(): string {
  // The week that can be paid this weekend is the previous boeteweek
  return getPreviousWeekKey(getCurrentBoeteweekKey());
}

function isWeekendNow(): boolean {
  const day = new Date().getDay();
  return day === 6 || day === 0;
}

interface BetalingWeekData {
  weekKey: string;
  weekLabel: string;
  weekNr: number;
  spelers: {
    speler: Speler;
    baseFines: number;
    adjustedFines: number;
    carryover: number;
    carryoverLabel: string;
    teBetalen: number;
    betaling: Betaling | null;
  }[];
  weekTotaal: number;
}

export default function BetalingPage() {
  return (
    <AuthGuard>
      <AppShell>
        <BetalingContent />
      </AppShell>
    </AuthGuard>
  );
}

function BetalingContent() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'betaling' | 'boete-week' | 'afgerond'>('betaling');
  const [loading, setLoading] = useState(true);
  const [weken, setWeken] = useState<BetalingWeekData[]>([]);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [editingTeWeinig, setEditingTeWeinig] = useState<string | null>(null);
  const [teWeinigValue, setTeWeinigValue] = useState('');
  const [boetepotBasis, setBoetepotBasis] = useState(0);
  const [boetepotVanafWeek, setBoetepotVanafWeek] = useState<string | null>(null);
  const [editingBoetepot, setEditingBoetepot] = useState(false);
  const [boetepotInput, setBoetepotInput] = useState('');
  const [screenshots, setScreenshots] = useState<BankScreenshot[]>([]);
  const [allSpelers, setAllSpelers] = useState<Speler[]>([]);
  const [instellingen, setInstellingen] = useState<AppInstellingen | null>(null);

  const isBeheerder = profile?.rol === 'beheerder' || profile?.rol === 'hoofdbeheerder';
  const isHoofdbeheerder = profile?.rol === 'hoofdbeheerder';

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    const { data: inst } = await supabase.from('app_instellingen').select('*').eq('id', 1).maybeSingle();
    setInstellingen(inst as AppInstellingen | null);

    const { data: acts } = await supabase.from('activiteiten').select('*').eq('afgerond', true).order('datum', { ascending: false });
    const actIds = (acts ?? []).map((a: any) => a.id);
    const [{ data: actSpelers }, { data: overige }, { data: betalingen }, { data: shots }, { data: spelers }] = await Promise.all([
      supabase.from('activiteit_spelers')
        .select('*, spelers(*), activiteiten!inner(datum, naam, is_dubbel, is_dubbele_maand), boete_items(*, boetecategorieen(*))')
        .in('activiteit_id', actIds),
      supabase.from('overige_boetes').select('*, spelers(*)').order('datum', { ascending: false }),
      supabase.from('betalingen').select('*, spelers(*)'),
      supabase.from('bank_screenshots').select('*').order('created_at', { ascending: false }),
      supabase.from('spelers').select('*').eq('actief', true).eq('doe_mee_aan_boetes', true),
    ]);

    setScreenshots(shots as BankScreenshot[] ?? []);
    setAllSpelers(spelers as Speler[] ?? []);

    const { data: cats } = await supabase.from('boetecategorieen').select('*');
    const boetepot = extractBoetepotBasis((cats ?? []) as Boetecategorie[]);
    setBoetepotBasis(boetepot.basis);
    setBoetepotVanafWeek(boetepot.vanafWeek);

    const nulIsTwee = inst?.nul_euro_is_twee_euro ?? false;

    const weekFinesMap = new Map<string, Map<string, number>>();

    function addFines(weekKey: string, spelerId: string, amount: number) {
      if (!weekFinesMap.has(weekKey)) weekFinesMap.set(weekKey, new Map());
      const wm = weekFinesMap.get(weekKey)!;
      wm.set(spelerId, (wm.get(spelerId) ?? 0) + amount);
    }

    for (const as of actSpelers ?? []) {
      const act = as.activiteiten as any;
      if (!act) continue;
      const weekKey = getBoeteweekKey(act.datum);
      const speler = as.spelers as Speler;
      if (!speler || !speler.actief) continue;
      addFines(weekKey, speler.id, as.totaal_bedrag);
    }

    for (const ob of overige ?? []) {
      const weekKey = getBoeteweekKey(ob.datum);
      const speler = ob.spelers as Speler;
      if (!speler || !speler.actief) continue;
      addFines(weekKey, speler.id, ob.bedrag);
    }

    const betalingMap = new Map<string, Map<string, Betaling>>();
    for (const b of (betalingen ?? []) as Betaling[]) {
      if (!betalingMap.has(b.week_key)) betalingMap.set(b.week_key, new Map());
      betalingMap.get(b.week_key)!.set(b.speler_id, b);
    }

    const allWeekKeysAsc = Array.from(weekFinesMap.keys()).sort((a, b) => a.localeCompare(b));
    const teBetalenTracker = new Map<string, Map<string, number>>();
    const result: BetalingWeekData[] = [];

    for (const weekKey of allWeekKeysAsc) {
      const range = getBoeteweekRange(weekKey);
      const finesForWeek = weekFinesMap.get(weekKey)!;
      const prevWeekKey = getPreviousWeekKey(weekKey);
      const prevBetalingen = betalingMap.get(prevWeekKey);
      const prevTeBetalen = teBetalenTracker.get(prevWeekKey);

      const spelersData: BetalingWeekData['spelers'] = [];

      for (const [spelerId, baseFines] of Array.from(finesForWeek.entries())) {
        let speler: Speler | undefined;
        for (const as of actSpelers ?? []) {
          if ((as.spelers as Speler)?.id === spelerId) { speler = as.spelers as Speler; break; }
        }
        if (!speler) {
          for (const ob of overige ?? []) {
            if ((ob.spelers as Speler)?.id === spelerId) { speler = ob.spelers as Speler; break; }
          }
        }
        if (!speler) continue;

        const adjustedFines = (baseFines === 0 && nulIsTwee) ? 200 : baseFines;

        let carryover = 0;
        let carryoverLabel = '';
        const prevBetaling = prevBetalingen?.get(spelerId);
        const prevFullTeBetalen = prevTeBetalen?.get(spelerId) ?? 0;

        if (prevBetaling && prevFullTeBetalen > 0) {
          if (prevBetaling.betaal_status === 'te_laag_betaald' || prevBetaling.betaal_status === 'niet_gedeeld') {
            carryover = prevFullTeBetalen;
            carryoverLabel = prevBetaling.betaal_status === 'niet_gedeeld'
              ? `Niet gedeeld wk ${prevWeekKey}: +${formatBedrag(prevFullTeBetalen)}`
              : `Te laat betaald wk ${prevWeekKey}: +${formatBedrag(prevFullTeBetalen)}`;
          } else if (prevBetaling.betaal_status === 'niet_betaald') {
            carryover = prevFullTeBetalen * 2;
            carryoverLabel = `Niet betaald wk ${prevWeekKey}: +${formatBedrag(prevFullTeBetalen * 2)}`;
          } else if (prevBetaling.betaal_status === 'te_weinig_betaald') {
            carryover = prevBetaling.te_weinig_bedrag * 2;
            carryoverLabel = `Te weinig betaald wk ${prevWeekKey}: +${formatBedrag(prevBetaling.te_weinig_bedrag * 2)}`;
          }
        }

        const teBetalen = adjustedFines + carryover;
        const betaling = betalingMap.get(weekKey)?.get(spelerId) ?? null;

        spelersData.push({ speler, baseFines, adjustedFines, carryover, carryoverLabel, teBetalen, betaling });
      }

      if (!teBetalenTracker.has(weekKey)) teBetalenTracker.set(weekKey, new Map());
      for (const s of spelersData) {
        teBetalenTracker.get(weekKey)!.set(s.speler.id, s.teBetalen);
      }

      spelersData.sort((a, b) => a.speler.naam.localeCompare(b.speler.naam));
      const weekTotaal = spelersData.reduce((sum, s) => sum + s.teBetalen, 0);
      result.push({ weekKey, weekLabel: range.label, weekNr: range.weekNr, spelers: spelersData, weekTotaal });
    }

    result.reverse();
    setWeken(result);
    setLoading(false);
  }

  async function setBetaalStatus(weekKey: string, spelerId: string, status: BetaalStatus) {
    if (!isHoofdbeheerder) return;
    const existing = weken.find(w => w.weekKey === weekKey)?.spelers.find(s => s.speler.id === spelerId)?.betaling;

    // Clicking the already-active status clears it
    if (existing && existing.betaal_status === status) {
      await supabase.from('betalingen').delete().eq('speler_id', spelerId).eq('week_key', weekKey);
      load();
      return;
    }

    const teWeinig = status === 'te_weinig_betaald' ? (existing?.te_weinig_bedrag ?? 0) : 0;

    await supabase.from('betalingen').upsert({
      speler_id: spelerId,
      week_key: weekKey,
      betaal_status: status,
      te_weinig_bedrag: teWeinig,
    }, { onConflict: 'speler_id,week_key' });

    load();
  }

  async function saveBoetepotBasis() {
    if (!isHoofdbeheerder) return;
    const bedrag = Math.round(parseFloat(boetepotInput.replace(',', '.')) * 100) || 0;
    const vanafWeek = getPayableWeekKey();
    const payload = `${BOETEPOT_PREFIX}${bedrag}|${vanafWeek ?? ''}`;

    const { data: cats } = await supabase.from('boetecategorieen').select('*');
    const existing = (cats as Boetecategorie[])?.find(c => c.naam.startsWith(BOETEPOT_PREFIX));
    if (existing) {
      await supabase.from('boetecategorieen').update({ naam: payload }).eq('id', existing.id);
    } else {
      const maxVolgorde = (cats as Boetecategorie[])?.reduce((max, c) => Math.max(max, c.volgorde), 0) ?? 0;
      await supabase.from('boetecategorieen').insert({
        naam: payload,
        bedrag: 0,
        verdubbelbaar: false,
        open_bedrag: false,
        actief: false,
        volgorde: maxVolgorde + 1,
      });
    }
    setEditingBoetepot(false);
    setBoetepotInput('');
    load();
  }

  async function saveTeWeinig(weekKey: string, spelerId: string) {
    if (!isHoofdbeheerder) return;
    const bedrag = Math.round(parseFloat(teWeinigValue.replace(',', '.')) * 100) || 0;
    await supabase.from('betalingen').upsert({
      speler_id: spelerId,
      week_key: weekKey,
      betaal_status: 'te_weinig_betaald',
      te_weinig_bedrag: bedrag,
    }, { onConflict: 'speler_id,week_key' });
    setEditingTeWeinig(null);
    setTeWeinigValue('');
    load();
  }

  async function saveBetaalUrl(url: string) {
    await supabase.from('app_instellingen').update({ betaal_url: url || null }).eq('id', 1);
    load();
  }

  async function toggleBetaalLinkActief() {
    if (!isHoofdbeheerder) return;
    const newValue = !(instellingen?.betaal_link_actief ?? true);
    await supabase.from('app_instellingen').update({ betaal_link_actief: newValue }).eq('id', 1);
    load();
  }

  async function setWeekNietGedeeld(weekKey: string) {
    if (!isHoofdbeheerder) return;
    const week = weken.find(w => w.weekKey === weekKey);
    if (!week) return;
    const allNietGedeeld = week.spelers.every(s => s.betaling?.betaal_status === 'niet_gedeeld');
    if (allNietGedeeld) {
      const spelerIds = week.spelers.map(s => s.speler.id);
      await supabase.from('betalingen').delete().in('speler_id', spelerIds).eq('week_key', weekKey);
    } else {
      const rows = week.spelers.map(s => ({
        speler_id: s.speler.id,
        week_key: weekKey,
        betaal_status: 'niet_gedeeld' as BetaalStatus,
        te_weinig_bedrag: 0,
      }));
      await supabase.from('betalingen').upsert(rows, { onConflict: 'speler_id,week_key' });
    }
    load();
  }

  const statusLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    betaald: { label: 'Betaald', color: 'bg-green-100 text-green-700', icon: <Check className="w-3 h-3" /> },
    te_laag_betaald: { label: 'Te laat betaald', color: 'bg-orange-100 text-orange-700', icon: <Clock className="w-3 h-3" /> },
    niet_betaald: { label: 'Niet betaald', color: 'bg-red-100 text-red-700', icon: <X className="w-3 h-3" /> },
    te_weinig_betaald: { label: 'Te weinig betaald', color: 'bg-amber-100 text-amber-700', icon: <AlertCircle className="w-3 h-3" /> },
  };

  const payableWeekKey = getPayableWeekKey();
  const visibleWeken = weken;
  const betalingWeken = weken.filter(w => w.weekKey === payableWeekKey);

  // Boetepot totaal = manual basis + sum of all paid weeks from vanafWeek onward
  const boetepotTotaal = boetepotBasis + weken.reduce((sum, w) => {
    if (boetepotVanafWeek && w.weekKey < boetepotVanafWeek) return sum;
    return sum + w.spelers.reduce((s2, sp) => {
      return sp.betaling?.betaal_status === 'betaald' ? s2 + sp.teBetalen : s2;
    }, 0);
  }, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Betaling</h1>
        <p className="text-sm text-gray-500">Boeteoverzicht en betalingsstatus per week</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <TabButton active={tab === 'betaling'} onClick={() => setTab('betaling')} icon={<Wallet className="w-4 h-4" />} label="Betaling" />
        <TabButton active={tab === 'boete-week'} onClick={() => setTab('boete-week')} icon={<BarChart3 className="w-4 h-4" />} label="Boete week" />
        {isHoofdbeheerder && (
          <TabButton active={tab === 'afgerond'} onClick={() => setTab('afgerond')} icon={<Camera className="w-4 h-4" />} label="Afgerond" />
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : visibleWeken.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nog geen betalingsgegevens voor deze week</p>
          <p className="text-xs mt-1">Betalingen zijn alleen zichtbaar voor de huidige week (zaterdag en zondag).</p>
        </div>
      ) : (
        <>
          {tab === 'betaling' ? (
            <PersoonlijkeBetalingTab
              profile={profile}
              weken={betalingWeken}
              instellingen={instellingen}
              isHoofdbeheerder={isHoofdbeheerder}
              onSaveBetaalUrl={saveBetaalUrl}
              onToggleBetaalLinkActief={toggleBetaalLinkActief}
            />
          ) : tab === 'boete-week' ? (
            <BoeteWeekTab
              weken={visibleWeken}
              expandedWeek={expandedWeek}
              setExpandedWeek={setExpandedWeek}
              isBeheerder={isHoofdbeheerder}
              editingTeWeinig={editingTeWeinig}
              setEditingTeWeinig={setEditingTeWeinig}
              teWeinigValue={teWeinigValue}
              setTeWeinigValue={setTeWeinigValue}
              setBetaalStatus={setBetaalStatus}
              saveTeWeinig={saveTeWeinig}
              statusLabels={statusLabels}
              onSetWeekNietGedeeld={setWeekNietGedeeld}
              boetepotBasis={boetepotBasis}
              boetepotVanafWeek={boetepotVanafWeek}
              boetepotTotaal={boetepotTotaal}
              isHoofdbeheerder={isHoofdbeheerder}
              editingBoetepot={editingBoetepot}
              setEditingBoetepot={setEditingBoetepot}
              boetepotInput={boetepotInput}
              setBoetepotInput={setBoetepotInput}
              onSaveBoetepotBasis={saveBoetepotBasis}
            />
          ) : (
            <AfgerondTab screenshots={screenshots} spelers={allSpelers} weken={visibleWeken} onChanged={load} />
          )}
        </>
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

const statusLabelsGlobal: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  betaald: { label: 'Betaald', color: 'bg-green-100 text-green-700', icon: <Check className="w-3 h-3" /> },
  te_laag_betaald: { label: 'Te laat betaald', color: 'bg-orange-100 text-orange-700', icon: <Clock className="w-3 h-3" /> },
  niet_betaald: { label: 'Niet betaald', color: 'bg-red-100 text-red-700', icon: <X className="w-3 h-3" /> },
  te_weinig_betaald: { label: 'Te weinig betaald', color: 'bg-amber-100 text-amber-700', icon: <AlertCircle className="w-3 h-3" /> },
  niet_gedeeld: { label: 'Niet gedeeld', color: 'bg-gray-200 text-gray-600', icon: <X className="w-3 h-3" /> },
};

// ============================================================
// PERSOONLIJKE BETALING TAB - personal boete + single link
// ============================================================
function PersoonlijkeBetalingTab({ profile, weken, instellingen, isHoofdbeheerder, onSaveBetaalUrl, onToggleBetaalLinkActief }: {
  profile: { id: string; naam?: string; email?: string; rol?: string } | null;
  weken: BetalingWeekData[];
  instellingen: AppInstellingen | null;
  isHoofdbeheerder: boolean;
  onSaveBetaalUrl: (url: string) => void;
  onToggleBetaalLinkActief: () => void;
}) {
  const [spelerId, setSpelerId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState(false);
  const [editUrl, setEditUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: speler } = await supabase
        .from('spelers')
        .select('id, naam')
        .eq('profile_id', profile.id)
        .maybeSingle();
      if (speler) {
        setSpelerId(speler.id);
      }
    })();
  }, [profile]);

  const myWeeks = spelerId ? weken.filter(w => w.spelers.some(s => s.speler.id === spelerId)) : [];
  const betaalUrl = instellingen?.betaal_url ?? null;
  const betaalLinkActief = instellingen?.betaal_link_actief ?? true;
  const showLink = betaalUrl && betaalLinkActief && isWeekendNow();
  const currentWeekKey = getPayableWeekKey();

  async function saveLink() {
    setSaving(true);
    await onSaveBetaalUrl(editUrl.trim());
    setEditingLink(false);
    setEditUrl('');
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      {/* Personal boete overview */}
      {spelerId ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Mijn boetes</p>
          {myWeeks.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Wallet className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Geen boetes gevonden</p>
              <p className="text-xs mt-1">Er staan nog geen boetes op je naam.</p>
            </div>
          ) : (
            myWeeks.map(week => {
              const myEntry = week.spelers.find(s => s.speler.id === spelerId);
              if (!myEntry) return null;
              const status = myEntry.betaling?.betaal_status;
              const statusInfo = status ? statusLabelsGlobal[status] : null;
              const isCurrentWeek = week.weekKey === currentWeekKey;
              const showLinkForThisWeek = showLink && isCurrentWeek;
              return (
                <div key={week.weekKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-gray-900 text-sm">{week.weekLabel}</p>
                      <span className="text-base font-bold text-blue-700">{formatBedrag(myEntry.teBetalen)}</span>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Weekboetes</span>
                        <span className="text-gray-600">{formatBedrag(myEntry.baseFines)}</span>
                      </div>
                      {myEntry.baseFines === 0 && myEntry.adjustedFines === 200 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-blue-500">0€ = 2€ regel</span>
                          <span className="text-blue-600">+{formatBedrag(200)}</span>
                        </div>
                      )}
                      {myEntry.carryover > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-orange-500">{myEntry.carryoverLabel}</span>
                          <span className="text-orange-600">+{formatBedrag(myEntry.carryover)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs pt-0.5 border-t border-gray-100">
                        <span className="font-bold text-gray-900">Te betalen</span>
                        <span className="font-bold text-blue-700">{formatBedrag(myEntry.teBetalen)}</span>
                      </div>
                    </div>
                    {statusInfo && (
                      <div className="mt-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.icon}
                          {statusInfo.label}
                        </span>
                      </div>
                    )}
                  </div>
                  {showLinkForThisWeek && (
                    <a href={betaalUrl!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 bg-green-600 text-white hover:bg-green-700 transition-colors">
                      <Link2 className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm font-semibold flex-1">Betaalverzoek openen</span>
                      <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" />
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Niet gekoppeld aan een speler</p>
          <p className="text-xs mt-1">Vraag de hoofdbeheerder om je account te koppelen.</p>
        </div>
      )}

      {/* Single betaal link management - only hoofdbeheerder */}
      {isHoofdbeheerder && (
        <div className="space-y-4">
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Betaalverzoek link</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            {/* Betaallink actief toggle */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-800">Betaallink delen</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Uit = link verborgen, ook in het weekend</p>
              </div>
              <button
                onClick={onToggleBetaalLinkActief}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${betaalLinkActief ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${betaalLinkActief ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {editingLink ? (
              <div className="space-y-3">
                <input
                  type="url"
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  autoFocus
                  placeholder="https://..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveLink}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" />
                    Opslaan
                  </button>
                  <button
                    onClick={() => { setEditingLink(false); setEditUrl(''); }}
                    className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Link2 className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  {betaalUrl ? (
                    <p className="text-xs text-blue-600 truncate">{betaalUrl}</p>
                  ) : (
                    <p className="text-xs text-gray-400">Nog geen link ingesteld</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-0.5">Alleen zaterdag & zondag zichtbaar voor spelers (mits delen aan staat)</p>
                </div>
                <button
                  onClick={() => { setEditingLink(true); setEditUrl(betaalUrl ?? ''); }}
                  className="flex items-center gap-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {betaalUrl ? 'Wijzigen' : 'Instellen'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BOETE WEEK TAB - overview per player + beheerder payment controls
// ============================================================
function BoeteWeekTab({ weken, expandedWeek, setExpandedWeek, isBeheerder, editingTeWeinig, setEditingTeWeinig, teWeinigValue, setTeWeinigValue, setBetaalStatus, saveTeWeinig, statusLabels, onSetWeekNietGedeeld, boetepotBasis, boetepotVanafWeek, boetepotTotaal, isHoofdbeheerder, editingBoetepot, setEditingBoetepot, boetepotInput, setBoetepotInput, onSaveBoetepotBasis }: {
  weken: BetalingWeekData[];
  expandedWeek: string | null;
  setExpandedWeek: (k: string | null) => void;
  isBeheerder: boolean;
  editingTeWeinig: string | null;
  setEditingTeWeinig: (k: string | null) => void;
  teWeinigValue: string;
  setTeWeinigValue: (v: string) => void;
  setBetaalStatus: (weekKey: string, spelerId: string, status: BetaalStatus) => void;
  saveTeWeinig: (weekKey: string, spelerId: string) => void;
  statusLabels: Record<string, { label: string; color: string; icon: React.ReactNode }>;
  onSetWeekNietGedeeld: (weekKey: string) => void;
  boetepotBasis: number;
  boetepotVanafWeek: string | null;
  boetepotTotaal: number;
  isHoofdbeheerder: boolean;
  editingBoetepot: boolean;
  setEditingBoetepot: (v: boolean) => void;
  boetepotInput: string;
  setBoetepotInput: (v: string) => void;
  onSaveBoetepotBasis: () => void;
}) {
  // Build top 3 betalingen podium — only count weeks actually paid
  const podiumMap = new Map<string, { speler: Speler; totaal: number }>();
  for (const w of weken) {
    for (const s of w.spelers) {
      if (s.betaling?.betaal_status !== 'betaald') continue;
      const cur = podiumMap.get(s.speler.id);
      if (cur) cur.totaal += s.teBetalen;
      else podiumMap.set(s.speler.id, { speler: s.speler, totaal: s.teBetalen });
    }
  }
  const podiumSpelers = Array.from(podiumMap.values()).sort((a, b) => b.totaal - a.totaal).slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Boetepot totaal banner — editable by hoofdbeheerder */}
      <div className="bg-blue-50 rounded-2xl border border-blue-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-semibold text-gray-900">Boetepot totaal</p>
          </div>
          {isHoofdbeheerder && !editingBoetepot && (
            <button
              onClick={() => { setBoetepotInput((boetepotBasis / 100).toFixed(2).replace('.', ',')); setEditingBoetepot(true); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-base font-bold text-blue-700">{formatBedrag(boetepotTotaal)}</span>
        </div>
        {editingBoetepot && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={boetepotInput}
              onChange={e => setBoetepotInput(e.target.value)}
              placeholder="bijv. 300,00"
              autoFocus
              className="w-28 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={onSaveBoetepotBasis}
              className="px-2 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
            >
              Opslaan
            </button>
            <button
              onClick={() => { setEditingBoetepot(false); setBoetepotInput(''); }}
              className="px-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-medium hover:bg-gray-200"
            >
              Annuleren
            </button>
            <p className="text-[11px] text-gray-400 ml-1">Wordt ingesteld vanaf de huidige week en telt daarna automatisch door.</p>
          </div>
        )}
      </div>
      {podiumSpelers.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-900">Meeste betalingen</p>
          </div>
          <div className="grid grid-cols-3 gap-2 items-end">
            {podiumSpelers.map((entry, index) => (
              <div key={entry.speler.id} className={`text-center ${index === 0 ? 'order-2' : index === 1 ? 'order-1' : 'order-3'}`}>
                <div className={`mx-auto mb-1 flex items-center justify-center rounded-full font-bold text-sm ${index === 0 ? 'w-10 h-10 bg-amber-100 text-amber-700' : 'w-8 h-8 bg-gray-100 text-gray-600'}`}>{index + 1}</div>
                <p className="text-xs font-semibold text-gray-800 truncate">{entry.speler.naam}</p>
                <p className="text-[11px] text-gray-400">{formatBedrag(entry.totaal)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {weken.map(week => {
        const incompleteCount = week.spelers.filter(s => !s.betaling?.betaal_status).length;
        const isNietGedeeld = week.spelers.length > 0 && week.spelers.every(s => s.betaling?.betaal_status === 'niet_gedeeld');
        return (
        <div key={week.weekKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setExpandedWeek(expandedWeek === week.weekKey ? null : week.weekKey)}
            className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900 text-sm">{week.weekLabel}</p>
                {isNietGedeeld && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-gray-500 font-medium bg-gray-100 px-1.5 py-0.5 rounded-md">
                    Niet gedeeld
                  </span>
                )}
                {isBeheerder && incompleteCount > 0 && !isNietGedeeld && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded-md">
                    <AlertCircle className="w-3 h-3" />
                    {incompleteCount} {incompleteCount === 1 ? 'speler' : 'spelers'} nog open
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">{week.spelers.length} spelers</p>
            </div>
            <span className="text-base font-bold text-blue-700">{formatBedrag(week.weekTotaal)}</span>
            {expandedWeek === week.weekKey ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {expandedWeek === week.weekKey && (
            <div className="border-t border-gray-50">
              {isBeheerder && (
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <button
                    onClick={() => onSetWeekNietGedeeld(week.weekKey)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isNietGedeeld
                        ? 'bg-gray-200 text-gray-700 ring-1 ring-gray-400'
                        : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <X className="w-3 h-3" />
                    {isNietGedeeld ? 'Niet gedeeld (klik om te wissen)' : 'Zet week op niet gedeeld'}
                  </button>
                  <p className="text-[11px] text-gray-400 mt-1 ml-0.5">Alle boetes schuiven door naar volgende week (niet verdubbeld)</p>
                </div>
              )}
              {week.spelers.map(s => {
                const status = s.betaling?.betaal_status;
                const statusInfo = status ? statusLabels[status] : null;
                const editKey = `${week.weekKey}-${s.speler.id}`;
                return (
                  <div key={s.speler.id} className="border-b border-gray-50 last:border-0 px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-800">{s.speler.naam}</span>
                      <span className="text-sm font-bold text-blue-700">{formatBedrag(s.teBetalen)}</span>
                    </div>

                    <div className="ml-10 space-y-0.5 mb-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Weekboetes</span>
                        <span className="text-gray-600">{formatBedrag(s.baseFines)}</span>
                      </div>
                      {s.baseFines === 0 && s.adjustedFines === 200 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-blue-500">0€ = 2€ regel</span>
                          <span className="text-blue-600">+{formatBedrag(200)}</span>
                        </div>
                      )}
                      {s.carryover > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-orange-500">{s.carryoverLabel}</span>
                          <span className="text-orange-600">+{formatBedrag(s.carryover)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs pt-0.5 border-t border-gray-100">
                        <span className="font-bold text-gray-900">Te betalen</span>
                        <span className="font-bold text-blue-700">{formatBedrag(s.teBetalen)}</span>
                      </div>
                    </div>

                    <div className="ml-10">
                      {isBeheerder ? (
                        <div className="space-y-2">
                          <div className="flex gap-1.5 flex-wrap">
                            {Object.entries(statusLabels).map(([key, info]) => (
                              <button
                                key={key}
                                onClick={() => setBetaalStatus(week.weekKey, s.speler.id, key as BetaalStatus)}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                  status === key ? `${info.color} ring-1 ring-current` : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                }`}
                              >
                                {info.icon}
                                {info.label}
                              </button>
                            ))}
                          </div>
                          {status === 'te_weinig_betaald' && (
                            <div className="flex items-center gap-2">
                              {editingTeWeinig === editKey ? (
                                <>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={teWeinigValue}
                                    onChange={e => setTeWeinigValue(e.target.value)}
                                    placeholder="bijv. 1,50"
                                    autoFocus
                                    className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <button
                                    onClick={() => saveTeWeinig(week.weekKey, s.speler.id)}
                                    className="px-2 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
                                  >
                                    Opslaan
                                  </button>
                                  <button
                                    onClick={() => { setEditingTeWeinig(null); setTeWeinigValue(''); }}
                                    className="px-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-medium hover:bg-gray-200"
                                  >
                                    Annuleren
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingTeWeinig(editKey);
                                    setTeWeinigValue(s.betaling?.te_weinig_bedrag ? ((s.betaling.te_weinig_bedrag / 100).toFixed(2).replace('.', ',')) : '');
                                  }}
                                  className="text-xs text-blue-600 font-medium hover:text-blue-800"
                                >
                                  {s.betaling?.te_weinig_bedrag
                                    ? `Te weinig: ${formatBedrag(s.betaling.te_weinig_bedrag)} (klik om te wijzigen)`
                                    : 'Vul te weinig bedrag in'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : statusInfo ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.icon}
                          {statusInfo.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Nog geen status ingesteld</span>
                      )}
                    </div>
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
      );
      })}
    </div>
  );
}
