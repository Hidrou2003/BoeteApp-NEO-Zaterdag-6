'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { supabase, Speler } from '@/lib/supabase';
import { ChevronDown, ChevronUp, User, Trophy, Calendar, BarChart3, Dumbbell, Target, Check, X, Minus } from 'lucide-react';
import { format, parseISO, getISOWeek, getISOWeekYear } from 'date-fns';
import { nl } from 'date-fns/locale';

function getISOWeekKey(dateStr: string): string {
  const date = parseISO(dateStr);
  const weekNr = getISOWeek(date);
  const year = getISOWeekYear(date);
  return `${year}-W${String(weekNr).padStart(2, '0')}`;
}

function getISOWeekRange(weekKey: string): { label: string } {
  const [yearStr, weekStr] = weekKey.split('-W');
  const year = parseInt(yearStr);
  const weekNr = parseInt(weekStr);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay();
  const isoWeek1Monday = new Date(jan4);
  isoWeek1Monday.setDate(jan4.getDate() - ((jan4Day + 6) % 7));
  const weekMonday = new Date(isoWeek1Monday);
  weekMonday.setDate(isoWeek1Monday.getDate() + (weekNr - 1) * 7);
  const sunday = new Date(weekMonday);
  sunday.setDate(weekMonday.getDate() + 6);
  const fmt = (d: Date) => format(d, 'dd-MM-yyyy');
  return { label: `Week ${weekNr}: ${fmt(weekMonday)} t/m ${fmt(sunday)}` };
}

function classifyActiviteit(naam: string): 'training' | 'wedstrijd' | 'overig' {
  const n = naam.toLowerCase();
  if (n.includes('training') || n.includes('trainingen')) return 'training';
  if (n.includes('wedstrijd')) return 'wedstrijd';
  return 'overig';
}

const aanwezigheidLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  aanwezig: { label: 'Aanwezig', color: 'text-green-600', icon: <Check className="w-3.5 h-3.5" /> },
  geoorloofd_afwezig: { label: 'Geoorloofd afwezig', color: 'text-amber-600', icon: <Minus className="w-3.5 h-3.5" /> },
  ongeoorloofd_afwezig: { label: 'Ongeoorloofd afwezig', color: 'text-red-600', icon: <X className="w-3.5 h-3.5" /> },
};

interface SpelerWeekEntry {
  speler: Speler;
  aanwezig: number;
  totaal: number;
  activiteiten: { naam: string; datum: string; aanwezigheid: string }[];
}

interface OpkomstWeekData {
  weekKey: string;
  weekLabel: string;
  spelers: SpelerWeekEntry[];
}

export default function OpkomstPage() {
  return (
    <AuthGuard>
      <AppShell>
        <OpkomstContent />
      </AppShell>
    </AuthGuard>
  );
}

function OpkomstContent() {
  const [tab, setTab] = useState<'per-week' | 'trainingen' | 'wedstrijden'>('per-week');
  const [weken, setWeken] = useState<OpkomstWeekData[]>([]);
  const [totaalTraining, setTotaalTraining] = useState<{ speler: Speler; count: number }[]>([]);
  const [totaalWedstrijd, setTotaalWedstrijd] = useState<{ speler: Speler; count: number }[]>([]);
  const [podium, setPodium] = useState<{ speler: Speler; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: acts } = await supabase
      .from('activiteiten')
      .select('id, naam, datum')
      .eq('afgerond', true)
      .order('datum', { ascending: false });

    if (!acts || acts.length === 0) { setLoading(false); return; }

    const { data: actSpelers } = await supabase
      .from('activiteit_spelers')
      .select('speler_id, aanwezigheid, activiteiten!inner(id, naam, datum)')
      .in('activiteit_id', acts.map(a => a.id));

    const spelersMap = new Map<string, Speler>();
    const { data: allSpelers } = await supabase.from('spelers').select('*').eq('actief', true).eq('doe_mee_aan_boetes', true);
    for (const s of (allSpelers ?? []) as Speler[]) spelersMap.set(s.id, s);

    const weekMap = new Map<string, OpkomstWeekData>();
    const trainingMap = new Map<string, number>();
    const wedstrijdMap = new Map<string, number>();
    const overallMap = new Map<string, number>();

    for (const row of (actSpelers ?? []) as any[]) {
      const act = row.activiteiten as any;
      if (!act) continue;
      const speler = spelersMap.get(row.speler_id);
      if (!speler) continue;

      const weekKey = getISOWeekKey(act.datum);
      if (!weekMap.has(weekKey)) {
        const range = getISOWeekRange(weekKey);
        weekMap.set(weekKey, { weekKey, weekLabel: range.label, spelers: [] });
      }
      const wd = weekMap.get(weekKey)!;
      let entry = wd.spelers.find(s => s.speler.id === speler.id);
      if (!entry) {
        entry = { speler, aanwezig: 0, totaal: 0, activiteiten: [] };
        wd.spelers.push(entry);
      }
      entry.totaal++;
      if (row.aanwezigheid === 'aanwezig') entry.aanwezig++;
      entry.activiteiten.push({ naam: act.naam, datum: act.datum, aanwezigheid: row.aanwezigheid ?? 'ongeoorloofd_afwezig' });

      if (row.aanwezigheid === 'aanwezig') {
        const cat = classifyActiviteit(act.naam);
        if (cat === 'training') trainingMap.set(speler.id, (trainingMap.get(speler.id) ?? 0) + 1);
        else if (cat === 'wedstrijd') wedstrijdMap.set(speler.id, (wedstrijdMap.get(speler.id) ?? 0) + 1);
        overallMap.set(speler.id, (overallMap.get(speler.id) ?? 0) + 1);
      }
    }

    const sortedWeeks = Array.from(weekMap.values()).sort((a, b) => b.weekKey.localeCompare(a.weekKey));
    for (const w of sortedWeeks) {
      w.spelers.sort((a, b) => b.aanwezig - a.aanwezig || a.speler.naam.localeCompare(b.speler.naam));
      for (const s of w.spelers) {
        s.activiteiten.sort((a, b) => b.datum.localeCompare(a.datum));
      }
    }
    setWeken(sortedWeeks);

    const toList = (m: Map<string, number>) => Array.from(m.entries())
      .map(([id, count]) => ({ speler: spelersMap.get(id)!, count }))
      .filter(e => e.speler)
      .sort((a, b) => b.count - a.count || a.speler.naam.localeCompare(b.speler.naam));
    setTotaalTraining(toList(trainingMap));
    setTotaalWedstrijd(toList(wedstrijdMap));
    setPodium(toList(overallMap).slice(0, 3));
    setLoading(false);
  }

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Opkomst</h1>
        <p className="text-sm text-gray-500">Aanwezigheid per speler en activiteit</p>
      </div>

      {podium.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-900">Meeste aanwezig (totaal)</p>
          </div>
          <div className="grid grid-cols-3 gap-2 items-end">
            {podium.map((entry, index) => (
              <div key={entry.speler.id} className={`text-center ${index === 0 ? 'order-2' : index === 1 ? 'order-1' : 'order-3'}`}>
                <div className={`mx-auto mb-1 flex items-center justify-center rounded-full font-bold text-sm ${index === 0 ? 'w-10 h-10 bg-amber-100 text-amber-700' : 'w-8 h-8 bg-gray-100 text-gray-600'}`}>{index + 1}</div>
                <p className="text-xs font-semibold text-gray-800 truncate">{entry.speler.naam}</p>
                <p className="text-[11px] text-gray-400">{entry.count}x aanwezig</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <TabButton active={tab === 'per-week'} onClick={() => setTab('per-week')} icon={<BarChart3 className="w-4 h-4" />} label="Per Week" />
        <TabButton active={tab === 'trainingen'} onClick={() => setTab('trainingen')} icon={<Dumbbell className="w-4 h-4" />} label="Trainingen" />
        <TabButton active={tab === 'wedstrijden'} onClick={() => setTab('wedstrijden')} icon={<Target className="w-4 h-4" />} label="Wedstrijden" />
      </div>

      {tab === 'per-week' ? (
        <PerWeekTab weken={weken} />
      ) : tab === 'trainingen' ? (
        <CategoryTab spelers={totaalTraining} emptyText="Nog geen trainingen" />
      ) : (
        <CategoryTab spelers={totaalWedstrijd} emptyText="Nog geen wedstrijden" />
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

function PerWeekTab({ weken }: { weken: OpkomstWeekData[] }) {
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [expandedSpeler, setExpandedSpeler] = useState<string | null>(null);

  if (weken.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Nog geen opkomstgegevens</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
            {expandedWeek === week.weekKey ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {expandedWeek === week.weekKey && (
            <div className="border-t border-gray-50">
              {week.spelers.map(s => {
                const spelerKey = `${week.weekKey}-${s.speler.id}`;
                const isExpanded = expandedSpeler === spelerKey;
                return (
                  <div key={s.speler.id} className="border-b border-gray-50 last:border-0">
                    <button
                      onClick={() => setExpandedSpeler(isExpanded ? null : spelerKey)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-green-600" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-800">{s.speler.naam}</span>
                      <span className="text-sm font-bold text-green-700">{s.aanwezig}/{s.totaal}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-3 ml-10 space-y-1.5">
                        {s.activiteiten.map((act, i) => {
                          const info = aanwezigheidLabels[act.aanwezigheid] ?? aanwezigheidLabels['ongeoorloofd_afwezig'];
                          const datum = format(parseISO(act.datum), 'EEE d MMM', { locale: nl });
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={info.color}>{info.icon}</span>
                              <span className="text-gray-600 capitalize flex-1">{act.naam} · {datum}</span>
                              <span className={`font-medium ${info.color}`}>{info.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CategoryTab({ spelers, emptyText }: { spelers: { speler: Speler; count: number }[]; emptyText: string }) {
  const [expanded, setExpanded] = useState(false);
  if (spelers.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <p className="font-semibold text-gray-900 text-sm flex-1">Alle spelers</p>
        <span className="text-xs text-gray-400">{spelers.length} spelers</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {expanded && (
        <div className="border-t border-gray-50">
          {spelers.map((s, i) => (
            <div key={s.speler.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
              <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-green-700">{i + 1}</span>
              </div>
              <span className="flex-1 text-sm font-medium text-gray-800">{s.speler.naam}</span>
              <span className="text-sm font-bold text-gray-700">{s.count}x</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
