'use client';

import { useEffect, useState, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Speler, Wedstrijd, WedstrijdSpelerStats, formatBedrag } from '@/lib/supabase';
import { TrendingUp, Plus, ChevronDown, ChevronUp, Trash2, Calendar, Users, Target, Hand, Square, Circle, ArrowLeft, Check, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function StatistiekenPage() {
  return (
    <AuthGuard>
      <AppShell>
        <StatistiekenContent />
      </AppShell>
    </AuthGuard>
  );
}

interface WedstrijdMetStats extends Wedstrijd {
  stats?: WedstrijdSpelerStats[];
}

interface SpelerStatInput {
  speler_id: string;
  goals: number;
  assists: number;
  gele_kaarten: number;
  rode_kaarten: number;
  eigen_goals: number;
}

function StatistiekenContent() {
  const { profile } = useAuth();
  const [wedstrijden, setWedstrijden] = useState<WedstrijdMetStats[]>([]);
  const [spelers, setSpelers] = useState<Speler[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [totaalStats, setTotaalStats] = useState<Record<string, { goals: number; assists: number; gele_kaarten: number; rode_kaarten: number; eigen_goals: number }>>({});

  const isStatistiekenbeheerder = (profile?.is_statistiekenbeheerder ?? false) || profile?.rol === 'hoofdbeheerder';

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: weds }, { data: sps }, { data: stats }] = await Promise.all([
      supabase.from('wedstrijden').select('*').order('datum', { ascending: false }),
      supabase.from('spelers').select('*').eq('actief', true).order('naam'),
      supabase.from('wedstrijd_speler_stats').select('*, spelers(*)'),
    ]);

    const wedstrijdMap = new Map<string, WedstrijdSpelerStats[]>();
    for (const s of stats ?? []) {
      const list = wedstrijdMap.get(s.wedstrijd_id) ?? [];
      list.push(s);
      wedstrijdMap.set(s.wedstrijd_id, list);
    }

    const wedsMetStats = (weds ?? []).map(w => ({ ...w, stats: wedstrijdMap.get(w.id) ?? [] }));
    setWedstrijden(wedsMetStats);
    setSpelers(sps ?? []);

    recalcTotaalStats(stats ?? []);
    setLoading(false);
  }

  function recalcTotaalStats(stats: WedstrijdSpelerStats[]) {
    const totals: Record<string, { goals: number; assists: number; gele_kaarten: number; rode_kaarten: number; eigen_goals: number }> = {};
    for (const s of stats) {
      if (!totals[s.speler_id]) totals[s.speler_id] = { goals: 0, assists: 0, gele_kaarten: 0, rode_kaarten: 0, eigen_goals: 0 };
      totals[s.speler_id].goals += s.goals;
      totals[s.speler_id].assists += s.assists;
      totals[s.speler_id].gele_kaarten += s.gele_kaarten;
      totals[s.speler_id].rode_kaarten += s.rode_kaarten;
      totals[s.speler_id].eigen_goals += s.eigen_goals;
    }
    // Remove entries where all stats are 0
    for (const id of Object.keys(totals)) {
      const t = totals[id];
      if (t.goals === 0 && t.assists === 0 && t.gele_kaarten === 0 && t.rode_kaarten === 0 && t.eigen_goals === 0) {
        delete totals[id];
      }
    }
    setTotaalStats(totals);
  }

  async function addWedstrijdWithStats(datum: string, tegenstander: string, locatie: string, stats: SpelerStatInput[]) {
    const { data: wedstrijd, error: wedstrijdError } = await supabase.from('wedstrijden').insert({
      datum,
      tegenstander,
      locatie: locatie || null,
      gemaakt_door: profile?.id,
    }).select().single();

    if (wedstrijdError) throw new Error(wedstrijdError.message);
    if (!wedstrijd) throw new Error('De wedstrijd kon niet worden opgeslagen.');

    const validStats = stats.filter(s => s.goals > 0 || s.assists > 0 || s.gele_kaarten > 0 || s.rode_kaarten > 0 || s.eigen_goals > 0);
    let savedStats: WedstrijdSpelerStats[] = [];
    if (validStats.length > 0) {
      const { data: inserted, error: statsError } = await supabase.from('wedstrijd_speler_stats').insert(
        validStats.map(s => ({
          wedstrijd_id: wedstrijd.id,
          speler_id: s.speler_id,
          goals: s.goals,
          assists: s.assists,
          gele_kaarten: s.gele_kaarten,
          rode_kaarten: s.rode_kaarten,
          eigen_goals: s.eigen_goals,
        }))
      ).select('*, spelers(*)');
      if (statsError) {
        await supabase.from('wedstrijden').delete().eq('id', wedstrijd.id);
        throw new Error(statsError.message);
      }
      savedStats = inserted ?? [];
    }

    const newWedstrijd: WedstrijdMetStats = { ...wedstrijd, stats: savedStats };
    setWedstrijden(prev => [newWedstrijd, ...prev]);

    // Update totaalStats locally
    const allStats = wedstrijden.flatMap(w => w.stats ?? []).concat(savedStats);
    recalcTotaalStats(allStats);

    setShowAddForm(false);
  }

  async function deleteWedstrijd(id: string) {
    await supabase.from('wedstrijd_speler_stats').delete().eq('wedstrijd_id', id);
    await supabase.from('wedstrijden').delete().eq('id', id);
    setWedstrijden(prev => prev.filter(w => w.id !== id));
    // Recalc totals
    const remaining = wedstrijden.filter(w => w.id !== id).flatMap(w => w.stats ?? []);
    recalcTotaalStats(remaining);
  }

  const updateStat = useCallback(async (wedstrijdId: string, spelerId: string, field: keyof WedstrijdSpelerStats, value: number) => {
    const existing = wedstrijden.find(w => w.id === wedstrijdId)?.stats?.find(s => s.speler_id === spelerId);

    // Compute what the new row would look like
    const updatedRow = existing ? { ...existing, [field]: value } : null;
    const allZero = updatedRow
      ? updatedRow.goals === 0 && updatedRow.assists === 0 && updatedRow.gele_kaarten === 0 && updatedRow.rode_kaarten === 0 && updatedRow.eigen_goals === 0
      : value === 0;

    if (existing && allZero) {
      // Delete the row entirely — all stats back to 0
      await supabase.from('wedstrijd_speler_stats').delete().eq('id', existing.id);
      setWedstrijden(prev => prev.map(w => {
        if (w.id !== wedstrijdId) return w;
        return { ...w, stats: (w.stats ?? []).filter(s => s.speler_id !== spelerId) };
      }));
      setTotaalStats(prev => {
        const cur = prev[spelerId] ?? { goals: 0, assists: 0, gele_kaarten: 0, rode_kaarten: 0, eigen_goals: 0 };
        const oldVal = existing[field] as number;
        const fieldName = field as keyof typeof cur;
        const newTotals = { ...cur, [fieldName]: (cur[fieldName] as number) - oldVal };
        if (newTotals.goals === 0 && newTotals.assists === 0 && newTotals.gele_kaarten === 0 && newTotals.rode_kaarten === 0 && newTotals.eigen_goals === 0) {
          const copy = { ...prev };
          delete copy[spelerId];
          return copy;
        }
        return { ...prev, [spelerId]: newTotals };
      });
      return;
    }

    if (existing) {
      await supabase.from('wedstrijd_speler_stats').update({ [field]: value }).eq('id', existing.id);
    } else {
      const { data } = await supabase.from('wedstrijd_speler_stats').insert({
        wedstrijd_id: wedstrijdId,
        speler_id: spelerId,
        [field]: value,
      }).select('*, spelers(*)').single();
      if (data) {
        setWedstrijden(prev => prev.map(w => {
          if (w.id !== wedstrijdId) return w;
          return { ...w, stats: [...(w.stats ?? []), data] };
        }));
        setTotaalStats(prev => {
          const cur = prev[spelerId] ?? { goals: 0, assists: 0, gele_kaarten: 0, rode_kaarten: 0, eigen_goals: 0 };
          const fieldName = field as keyof typeof cur;
          return { ...prev, [spelerId]: { ...cur, [fieldName]: (cur[fieldName] as number) + value } };
        });
        return;
      }
    }

    // Update local state for existing row
    setWedstrijden(prev => prev.map(w => {
      if (w.id !== wedstrijdId) return w;
      return {
        ...w,
        stats: (w.stats ?? []).map(s => s.speler_id === spelerId ? { ...s, [field]: value } : s),
      };
    }));

    // Update totaalStats locally — diff the old and new value
    setTotaalStats(prev => {
      const cur = prev[spelerId] ?? { goals: 0, assists: 0, gele_kaarten: 0, rode_kaarten: 0, eigen_goals: 0 };
      const oldVal = existing ? (existing[field] as number) : 0;
      const fieldName = field as keyof typeof cur;
      const newTotals = { ...cur, [fieldName]: (cur[fieldName] as number) - oldVal + value };
      if (newTotals.goals === 0 && newTotals.assists === 0 && newTotals.gele_kaarten === 0 && newTotals.rode_kaarten === 0 && newTotals.eigen_goals === 0) {
        const copy = { ...prev };
        delete copy[spelerId];
        return copy;
      }
      return { ...prev, [spelerId]: newTotals };
    });
  }, [wedstrijden]);

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Laden...</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Statistieken</h1>
        <p className="text-sm text-gray-500">Wedstrijdstatistieken per speler</p>
      </div>

      {/* Add wedstrijd button / form */}
      {isStatistiekenbeheerder && (
        showAddForm ? (
          <AddWedstrijdFormWithStats
            spelers={spelers}
            onAdd={addWedstrijdWithStats}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-sm text-sm"
          >
            <Plus className="w-4 h-4" />
            Wedstrijd toevoegen
          </button>
        )
      )}

      {/* Total stats per speler */}
      {Object.keys(totaalStats).length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Totaal per speler</p>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                    <th className="text-left px-4 py-2 font-semibold">Speler</th>
                    <th className="text-center px-2 py-2 font-semibold" title="Goals"><Target className="w-3.5 h-3.5 mx-auto" /></th>
                    <th className="text-center px-2 py-2 font-semibold" title="Assists"><Hand className="w-3.5 h-3.5 mx-auto" /></th>
                    <th className="text-center px-2 py-2 font-semibold" title="Gele kaarten"><Square className="w-3.5 h-3.5 mx-auto" /></th>
                    <th className="text-center px-2 py-2 font-semibold" title="Rode kaarten"><Circle className="w-3.5 h-3.5 mx-auto" /></th>
                    <th className="text-center px-2 py-2 font-semibold" title="Eigen goals"><ArrowLeft className="w-3.5 h-3.5 mx-auto" /></th>
                  </tr>
                </thead>
                <tbody>
                  {spelers.filter(s => totaalStats[s.id]).sort((a, b) => {
                    const ta = totaalStats[a.id];
                    const tb = totaalStats[b.id];
                    const sumA = ta.goals + ta.assists;
                    const sumB = tb.goals + tb.assists;
                    if (sumB !== sumA) return sumB - sumA;
                    if (tb.goals !== ta.goals) return tb.goals - ta.goals;
                    if (ta.eigen_goals !== tb.eigen_goals) return ta.eigen_goals - tb.eigen_goals;
                    if (ta.rode_kaarten !== tb.rode_kaarten) return ta.rode_kaarten - tb.rode_kaarten;
                    if (ta.gele_kaarten !== tb.gele_kaarten) return ta.gele_kaarten - tb.gele_kaarten;
                    return a.naam.localeCompare(b.naam, 'nl');
                  }).map(sp => {
                    const t = totaalStats[sp.id];
                    return (
                      <tr key={sp.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{sp.naam}</td>
                        <td className="text-center px-2 py-2.5 font-semibold text-gray-700">{t.goals}</td>
                        <td className="text-center px-2 py-2.5 font-semibold text-gray-700">{t.assists}</td>
                        <td className="text-center px-2 py-2.5 font-semibold text-yellow-700">{t.gele_kaarten}</td>
                        <td className="text-center px-2 py-2.5 font-semibold text-red-700">{t.rode_kaarten}</td>
                        <td className="text-center px-2 py-2.5 font-semibold text-red-600">{t.eigen_goals}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Wedstrijden list */}
      {wedstrijden.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Nog geen wedstrijden</p>
          <p className="text-xs mt-1">{isStatistiekenbeheerder ? 'Voeg een wedstrijd toe om te beginnen' : 'Er zijn nog geen wedstrijden ingevuld'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {wedstrijden.map(wedstrijd => {
            const isExpanded = expanded === wedstrijd.id;
            const datum = wedstrijd.datum ? format(parseISO(wedstrijd.datum), 'EEEE d MMMM yyyy', { locale: nl }) : '';
            return (
              <div key={wedstrijd.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpanded(isExpanded ? null : wedstrijd.id)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm capitalize">{datum}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-500 truncate">{wedstrijd.tegenstander}</p>
                      {wedstrijd.locatie && (
                        <>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400 flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" />
                            {wedstrijd.locatie}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {isStatistiekenbeheerder && (
                    <span
                      onClick={(e) => { e.stopPropagation(); if (confirm('Wedstrijd verwijderen?')) deleteWedstrijd(wedstrijd.id); }}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-50">
                    {isStatistiekenbeheerder ? (
                      <WedstrijdStatsEditor
                        wedstrijd={wedstrijd}
                        spelers={spelers}
                        onUpdateStat={updateStat}
                      />
                    ) : (
                      <WedstrijdStatsViewer wedstrijd={wedstrijd} spelers={spelers} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddWedstrijdFormWithStats({ spelers, onAdd, onCancel }: {
  spelers: Speler[];
  onAdd: (datum: string, tegenstander: string, locatie: string, stats: SpelerStatInput[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [datum, setDatum] = useState(() => {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  });
  const [tegenstander, setTegenstander] = useState('');
  const [locatie, setLocatie] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSpeler, setExpandedSpeler] = useState<string | null>(null);
  const [statInputs, setStatInputs] = useState<Record<string, SpelerStatInput>>({});

  function getStat(spelerId: string): SpelerStatInput {
    return statInputs[spelerId] ?? { speler_id: spelerId, goals: 0, assists: 0, gele_kaarten: 0, rode_kaarten: 0, eigen_goals: 0 };
  }

  function setStatField(spelerId: string, field: keyof SpelerStatInput, value: number) {
    setStatInputs(prev => ({
      ...prev,
      [spelerId]: { ...getStat(spelerId), [field]: value },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!datum || !tegenstander.trim()) {
      setError('Vul de datum en tegenstander in.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const stats = Object.values(statInputs);
      await onAdd(datum, tegenstander.trim(), locatie.trim(), stats);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'De wedstrijd kon niet worden opgeslagen.');
      setSaving(false);
    }
  }

  const hasAnyStats = Object.values(statInputs).some(s => s.goals > 0 || s.assists > 0 || s.gele_kaarten > 0 || s.rode_kaarten > 0 || s.eigen_goals > 0);

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Datum</label>
        <input
          type="date"
          value={datum}
          onChange={e => setDatum(e.target.value)}
          required
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Tegenstander</label>
        <input
          type="text"
          value={tegenstander}
          onChange={e => setTegenstander(e.target.value)}
          placeholder="bijv. NEO Zaterdag 3"
          required
          autoFocus
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Locatie (optioneel)</label>
        <input
          type="text"
          value={locatie}
          onChange={e => setLocatie(e.target.value)}
          placeholder="bijv. Thuis / Uit"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Player stats list */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-gray-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Spelerstatistieken</p>
          {hasAnyStats && <span className="text-xs text-green-600 font-medium">{Object.values(statInputs).filter(s => s.goals > 0 || s.assists > 0 || s.gele_kaarten > 0 || s.rode_kaarten > 0 || s.eigen_goals > 0).length} spelers met stats</span>}
        </div>
        <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-80 overflow-y-auto">
          {spelers.map(sp => {
            const isExpanded = expandedSpeler === sp.id;
            const stats = getStat(sp.id);
            const hasStats = stats.goals > 0 || stats.assists > 0 || stats.gele_kaarten > 0 || stats.rode_kaarten > 0 || stats.eigen_goals > 0;
            return (
              <div key={sp.id}>
                <button
                  type="button"
                  onClick={() => setExpandedSpeler(isExpanded ? null : sp.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{sp.naam}</p>
                    {hasStats && (
                      <div className="flex items-center gap-2 mt-0.5">
                        {stats.goals > 0 && <span className="text-xs text-gray-500">{stats.goals}G</span>}
                        {stats.assists > 0 && <span className="text-xs text-gray-500">{stats.assists}A</span>}
                        {stats.gele_kaarten > 0 && <span className="text-xs text-yellow-600">{stats.gele_kaarten}GK</span>}
                        {stats.rode_kaarten > 0 && <span className="text-xs text-red-600">{stats.rode_kaarten}RK</span>}
                        {stats.eigen_goals > 0 && <span className="text-xs text-red-500">{stats.eigen_goals}EG</span>}
                      </div>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2.5 bg-gray-50">
                    <StatRow label="Goals" icon={<Target className="w-4 h-4 text-gray-500" />}>
                      <StatStepper value={stats.goals} onChange={v => setStatField(sp.id, 'goals', v)} color="text-gray-600" />
                    </StatRow>
                    <StatRow label="Assists" icon={<Hand className="w-4 h-4 text-gray-500" />}>
                      <StatStepper value={stats.assists} onChange={v => setStatField(sp.id, 'assists', v)} color="text-gray-600" />
                    </StatRow>
                    <StatRow label="Gele kaarten" icon={<Square className="w-4 h-4 text-yellow-500" />}>
                      <StatStepper value={stats.gele_kaarten} onChange={v => setStatField(sp.id, 'gele_kaarten', v)} color="text-yellow-700" />
                    </StatRow>
                    <StatRow label="Rode kaarten" icon={<Circle className="w-4 h-4 text-red-500" />}>
                      <StatStepper value={stats.rode_kaarten} onChange={v => setStatField(sp.id, 'rode_kaarten', v)} color="text-red-700" />
                    </StatRow>
                    <StatRow label="Eigen goals" icon={<ArrowLeft className="w-4 h-4 text-red-500" />}>
                      <StatStepper value={stats.eigen_goals} onChange={v => setStatField(sp.id, 'eigen_goals', v)} color="text-red-600" />
                    </StatRow>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2">
          <Check className="w-4 h-4" /> {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 bg-gray-100 text-gray-500 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm">
          Annuleren
        </button>
      </div>
    </form>
  );
}

function StatStepper({ value, onChange, color }: {
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value === 0}
        className={`w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center ${color} hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-30`}
      >
        <span className="text-sm font-bold">-</span>
      </button>
      <span className="w-6 text-center text-sm font-bold text-gray-800">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className={`w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center ${color} hover:bg-gray-100 active:bg-gray-200 transition-colors`}
      >
        <span className="text-sm font-bold">+</span>
      </button>
    </div>
  );
}

function WedstrijdStatsEditor({ wedstrijd, spelers, onUpdateStat }: {
  wedstrijd: WedstrijdMetStats;
  spelers: Speler[];
  onUpdateStat: (wedstrijdId: string, spelerId: string, field: keyof WedstrijdSpelerStats, value: number) => void;
}) {
  const [expandedSpeler, setExpandedSpeler] = useState<string | null>(null);

  function getStat(spelerId: string, field: keyof WedstrijdSpelerStats): number {
    const s = wedstrijd.stats?.find(st => st.speler_id === spelerId);
    return s ? (s[field] as number) : 0;
  }

  return (
    <div className="divide-y divide-gray-50">
      {spelers.map(sp => {
        const isExpanded = expandedSpeler === sp.id;
        const hasStats = wedstrijd.stats?.some(s => s.speler_id === sp.id && (s.goals > 0 || s.assists > 0 || s.gele_kaarten > 0 || s.rode_kaarten > 0 || s.eigen_goals > 0));
        return (
          <div key={sp.id}>
            <button
              onClick={() => setExpandedSpeler(isExpanded ? null : sp.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{sp.naam}</p>
                {hasStats && (
                  <div className="flex items-center gap-2 mt-0.5">
                    {getStat(sp.id, 'goals') > 0 && <span className="text-xs text-gray-500">{getStat(sp.id, 'goals')}G</span>}
                    {getStat(sp.id, 'assists') > 0 && <span className="text-xs text-gray-500">{getStat(sp.id, 'assists')}A</span>}
                    {getStat(sp.id, 'gele_kaarten') > 0 && <span className="text-xs text-yellow-600">{getStat(sp.id, 'gele_kaarten')}GK</span>}
                    {getStat(sp.id, 'rode_kaarten') > 0 && <span className="text-xs text-red-600">{getStat(sp.id, 'rode_kaarten')}RK</span>}
                    {getStat(sp.id, 'eigen_goals') > 0 && <span className="text-xs text-red-500">{getStat(sp.id, 'eigen_goals')}EG</span>}
                  </div>
                )}
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 space-y-2.5 bg-gray-50">
                <StatRow label="Goals" icon={<Target className="w-4 h-4 text-gray-500" />}>
                  <StatStepper value={getStat(sp.id, 'goals')} onChange={v => onUpdateStat(wedstrijd.id, sp.id, 'goals', v)} color="text-gray-600" />
                </StatRow>
                <StatRow label="Assists" icon={<Hand className="w-4 h-4 text-gray-500" />}>
                  <StatStepper value={getStat(sp.id, 'assists')} onChange={v => onUpdateStat(wedstrijd.id, sp.id, 'assists', v)} color="text-gray-600" />
                </StatRow>
                <StatRow label="Gele kaarten" icon={<Square className="w-4 h-4 text-yellow-500" />}>
                  <StatStepper value={getStat(sp.id, 'gele_kaarten')} onChange={v => onUpdateStat(wedstrijd.id, sp.id, 'gele_kaarten', v)} color="text-yellow-700" />
                </StatRow>
                <StatRow label="Rode kaarten" icon={<Circle className="w-4 h-4 text-red-500" />}>
                  <StatStepper value={getStat(sp.id, 'rode_kaarten')} onChange={v => onUpdateStat(wedstrijd.id, sp.id, 'rode_kaarten', v)} color="text-red-700" />
                </StatRow>
                <StatRow label="Eigen goals" icon={<ArrowLeft className="w-4 h-4 text-red-500" />}>
                  <StatStepper value={getStat(sp.id, 'eigen_goals')} onChange={v => onUpdateStat(wedstrijd.id, sp.id, 'eigen_goals', v)} color="text-red-600" />
                </StatRow>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatRow({ label, icon, children }: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      {children}
    </div>
  );
}

function WedstrijdStatsViewer({ wedstrijd, spelers }: {
  wedstrijd: WedstrijdMetStats;
  spelers: Speler[];
}) {
  const spelersMetStats = (wedstrijd.stats ?? []).filter(s => s.goals > 0 || s.assists > 0 || s.gele_kaarten > 0 || s.rode_kaarten > 0 || s.eigen_goals > 0);

  if (spelersMetStats.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-gray-400">Nog geen statistieken ingevuld</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
            <th className="text-left px-4 py-2 font-semibold">Speler</th>
            <th className="text-center px-2 py-2 font-semibold" title="Goals"><Target className="w-3.5 h-3.5 mx-auto" /></th>
            <th className="text-center px-2 py-2 font-semibold" title="Assists"><Hand className="w-3.5 h-3.5 mx-auto" /></th>
            <th className="text-center px-2 py-2 font-semibold" title="Gele kaarten"><Square className="w-3.5 h-3.5 mx-auto" /></th>
            <th className="text-center px-2 py-2 font-semibold" title="Rode kaarten"><Circle className="w-3.5 h-3.5 mx-auto" /></th>
            <th className="text-center px-2 py-2 font-semibold" title="Eigen goals"><ArrowLeft className="w-3.5 h-3.5 mx-auto" /></th>
          </tr>
        </thead>
        <tbody>
          {spelersMetStats.map(s => (
            <tr key={s.id} className="border-b border-gray-50 last:border-0">
              <td className="px-4 py-2.5 font-medium text-gray-800">{s.spelers?.naam ?? '?'}</td>
              <td className="text-center px-2 py-2.5 font-semibold text-gray-700">{s.goals}</td>
              <td className="text-center px-2 py-2.5 font-semibold text-gray-700">{s.assists}</td>
              <td className="text-center px-2 py-2.5 font-semibold text-yellow-700">{s.gele_kaarten}</td>
              <td className="text-center px-2 py-2.5 font-semibold text-red-700">{s.rode_kaarten}</td>
              <td className="text-center px-2 py-2.5 font-semibold text-red-600">{s.eigen_goals}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
