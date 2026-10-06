'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, TeamMember, Rol } from '@/lib/supabase';
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
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const isHoofdbeheerder = activeTeamMember?.rol === 'hoofdbeheerder';
  const teamId = activeTeam?.id;

  useEffect(() => {
    if (teamId) {
      load();
    }
  }, [teamId, activeTeam]);

  async function load() {
    if (!teamId) return;
    setLoading(true);

    try {
      console.log('Bezig met ophalen voor teamId:', teamId);

      // 1. Haal alle teamleden op voor dit team
      const { data: membersData, error: membersError } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId);

      if (membersError) {
        console.error('Fout bij ophalen team_members:', membersError);
      }

      console.log('Opgehaalde teamleden:', membersData);

      if (!membersData || membersData.length === 0) {
        setMembers([]);
        setLoading(false);
        return;
      }

      // 2. Haal de unieke user_ids op
      const userIds = membersData
        .map((m) => m.user_id)
        .filter((id): id is string => Boolean(id));

      // 3. Haal profielen op
      let profilesMap = new Map();
      if (userIds.length > 0) {
        const { data: profilesData, error: profError } = await supabase
          .from('profiles')
          .select('id, email, naam')
          .in('id', userIds);

        if (profError) {
          console.warn('Kon profiles niet ophalen (mogelijk RLS):', profError);
        }

        if (profilesData) {
          profilesMap = new Map(profilesData.map((p) => [p.id, p]));
        }
      }

      // 4. Combineer de gegevens met fallback zodat er altijd rijen getoond worden
      const formattedMembers = membersData.map((m) => {
        const prof = profilesMap.get(m.user_id);
        return {
          ...m,
          profiles: prof || { naam: `Teamlid (${m.user_id.substring(0, 6)}...)`, email: '' },
        };
      });

      console.log('Gefiatteerde leden voor weergave:', formattedMembers);
      setMembers(formattedMembers);
    } catch (err) {
      console.error('Fout in load functie:', err);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  function canEdit(memberId: string, userId: string): boolean {
    return isHoofdbeheerder;
  }

  async function updateRol(memberId: string, userId: string, newRol: Rol) {
    if (!canEdit(memberId, userId)) return;
    setUpdating(memberId);
    await supabase.from('team_members').update({ rol: newRol }).eq('id', memberId);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, rol: newRol } : m)));
    setUpdating(null);
  }

  async function toggleStatistiekenbeheerder(memberId: string, userId: string, currentValue: boolean) {
    if (!canEdit(memberId, userId)) return;
    setUpdating(memberId);
    const newVal = !currentValue;
    await supabase.from('team_members').update({ is_statistiekenbeheerder: newVal }).eq('id', memberId);
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, is_statistiekenbeheerder: newVal } : m)),
    );
    setUpdating(null);
  }

  async function acceptMember(memberId: string) {
    if (!isHoofdbeheerder) return;
    setUpdating(memberId);
    const { error } = await supabase.rpc('accept_team_member', { p_member_id: memberId });
    if (!error) {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, is_geaccepteerd: true } : m)));
    }
    setUpdating(null);
  }

  async function removeMember(memberId: string, userId: string) {
    if (!canEdit(memberId, userId)) return;
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
          <li><span className="font-semibold">Statistiekenbeheerder</span> — Kan statistieken invullen. Kan gecombineerd worden met een andere rol.</li>
        </ul>
      </div>

      {!isHoofdbeheerder && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <Lock className="w-4 h-4 flex-shrink-0" />
          <p>Alleen hoofdbeheerders kunnen rollen aanpassen.</p>
        </div>
      )}

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
            const editable = canEdit(m.id, m.user_id);
            const isStat = m.is_statistiekenbeheerder ?? false;
            const displayName = m.profiles?.naam || m.profiles?.email || 'Speler / Lid';

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
                      {displayName}
                    </p>
                    {isHoofdbeheerder && m.profiles?.email && (
                      <p className="text-xs text-gray-400 truncate">{m.profiles.email}</p>
                    )}
                  </div>

                  <span
                    className={`text-xs font-semibold px-3 py-1.5 rounded-xl flex-shrink-0 ${rolColors[m.rol]}`}
                  >
                    {rolLabels[m.rol]}
                  </span>

                  {isStat && (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-green-100 text-green-800 flex-shrink-0 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Statistieken
                    </span>
                  )}

                  {!m.is_geaccepteerd && (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 flex-shrink-0">
                      Wacht op acceptatie
                    </span>
                  )}

                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-50 space-y-2">
                    {!m.is_geaccepteerd && isHoofdbeheerder && (
                      <button
                        type="button"
                        disabled={updating === m.id}
                        onClick={() => acceptMember(m.id)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                      >
                        <UserCheck className="w-4 h-4" />
                        Accepteren als speler
                      </button>
                    )}

                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rol</p>
                      {rollen.map((rol) => {
                        const checked = m.rol === rol;
                        const disabled = !editable || updating === m.id;
                        return (
                          <button
                            key={rol}
                            type="button"
                            disabled={disabled}
                            onClick={() => updateRol(m.id, m.user_id, rol)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                              disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-50'
                            }`}
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

                    <div className="pt-2 mt-2 border-t border-gray-50">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Extra</p>
                      <button
                        type="button"
                        disabled={!editable || updating === m.id}
                        onClick={() => toggleStatistiekenbeheerder(m.id, m.user_id, isStat)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                          !editable || updating === m.id ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                            isStat ? 'bg-green-600 border-green-600' : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isStat && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <TrendingUp className={`w-4 h-4 ${isStat ? 'text-green-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-medium ${isStat ? 'text-green-700' : 'text-gray-600'}`}>
                          Statistiekenbeheerder
                        </span>
                      </button>
                    </div>

                    {editable && m.user_id !== activeTeamMember?.user_id && (
                      <button
                        type="button"
                        disabled={updating === m.id}
                        onClick={() => removeMember(m.id, m.user_id)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors mt-2"
                      >
                        Uit team verwijderen
                      </button>
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
