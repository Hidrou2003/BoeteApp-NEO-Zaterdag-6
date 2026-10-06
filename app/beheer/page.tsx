'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Rol } from '@/lib/supabase';
import { Users, ChevronDown, ChevronUp, Check, Lock, TrendingUp, UserCheck } from 'lucide-react';

const rolLabels: Record<Rol, string> = {
  hoofdbeheerder: 'Hoofdbeheerder',
  beheerder: 'Beheerder',
  kijker: 'Kijker',
};

const rolColors: Record<Rol, string> = {
  hoofdbeheerder: 'bg-amber-100 text-amber-800',
  beheerder: 'bg-blue-100 text-blue-800',
  kijker: 'bg-gray-100 text-gray-600',
};

const rollen: Rol[] = ['kijker', 'beheerder', 'hoofdbeheerder'];

export default function BeheerPage() {
  return (
    <AuthGuard>
      <AppShell>
        <BeheerContent />
      </AppShell>
    </AuthGuard>
  );
}

function BeheerContent() {
  const { activeTeam, activeTeamMember } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const isHoofdbeheerder = activeTeamMember?.rol === 'hoofdbeheerder';
  const teamId = activeTeam?.id;

  useEffect(() => {
    if (teamId) {
      load();
    }
  }, [teamId]);

  async function load() {
    if (!teamId) return;
    setLoading(true);

    try {
      // Direct ophalen zonder joins of sorteerfilters die fouten kunnen geven
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId);

      if (error) {
        console.error('Fout bij ophalen teamleden:', error.message);
        setMembers([]);
      } else {
        setMembers(data || []);
      }
    } catch (err) {
      console.error('Onverwachte fout:', err);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  async function updateRol(memberId: string, newRol: Rol) {
    setUpdating(memberId);
    await supabase.from('team_members').update({ rol: newRol }).eq('id', memberId);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, rol: newRol } : m)));
    setUpdating(null);
  }

  async function toggleStatistiekenbeheerder(memberId: string, currentValue: boolean) {
    setUpdating(memberId);
    const newVal = !currentValue;
    await supabase.from('team_members').update({ is_statistiekenbeheerder: newVal }).eq('id', memberId);
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, is_statistiekenbeheerder: newVal } : m)),
    );
    setUpdating(null);
  }

  async function removeMember(memberId: string) {
    setUpdating(memberId);
    await supabase.from('team_members').delete().eq('id', memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    setUpdating(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Gebruikersbeheer</h1>
        <p className="text-sm text-gray-500">
          {isHoofdbeheerder ? 'Rollen aanpassen van teamleden' : 'Overzicht van teamleden'}
          {activeTeam ? ` - ${activeTeam.naam}` : ''}
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-sm text-blue-800">
        <p className="font-semibold mb-1">Rollenuitleg</p>
        <ul className="space-y-1 text-xs">
          <li><span className="font-semibold">Kijker</span> — Alleen bekijken, geen acties</li>
          <li><span className="font-semibold">Beheerder</span> — Activiteiten aanmaken en boetes uitdelen</li>
          <li><span className="font-semibold">Hoofdbeheerder</span> — Alle rechten inclusief gebruikersbeheer</li>
        </ul>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">
          Geen teamleden gevonden voor dit team.
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((m) => {
            const isOpen = expanded === m.id;
            const isStat = m.is_statistiekenbeheerder ?? false;

            return (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : m.id)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left"
                >
                  <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      Gebruiker ({m.user_id ? m.user_id.substring(0, 8) : 'Onbekend'}...)
                    </p>
                  </div>

                  <span
                    className={`text-xs font-semibold px-3 py-1.5 rounded-xl flex-shrink-0 ${rolColors[m.rol] || 'bg-gray-100 text-gray-800'}`}
                  >
                    {rolLabels[m.rol] || m.rol}
                  </span>

                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {isOpen && isHoofdbeheerder && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-50 space-y-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rol wijzigen</p>
                      {rollen.map((rol) => {
                        const checked = m.rol === rol;
                        return (
                          <button
                            key={rol}
                            type="button"
                            disabled={updating === m.id}
                            onClick={() => updateRol(m.id, rol)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                          >
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                                checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                              }`}
                            >
                              {checked && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <span className={`text-sm font-medium px-2 py-0.5 rounded-lg ${rolColors[rol]}`}>
                              {rolLabels[rol]}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      disabled={updating === m.id}
                      onClick={() => removeMember(m.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors mt-2"
                    >
                      Uit team verwijderen
                    </button>
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
