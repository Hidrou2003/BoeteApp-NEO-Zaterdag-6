'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Profile, Rol } from '@/lib/supabase';
import { Users, ChevronDown, ChevronUp, Check, Lock, TrendingUp } from 'lucide-react';

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
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const isHoofdbeheerder = profile?.rol === 'hoofdbeheerder';

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('naam');
    setUsers(data ?? []);
    setLoading(false);
  }

  function canEdit(userId: string): boolean {
    return isHoofdbeheerder && userId !== profile?.id;
  }

  async function updateRol(userId: string, newRol: Rol) {
    if (!canEdit(userId)) return;
    setUpdating(userId);
    await supabase.from('profiles').update({ rol: newRol }).eq('id', userId);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, rol: newRol } : u)));
    setUpdating(null);
  }

  async function toggleStatistiekenbeheerder(userId: string, currentValue: boolean) {
    if (!canEdit(userId)) return;
    setUpdating(userId);
    const newVal = !currentValue;
    await supabase.from('profiles').update({ is_statistiekenbeheerder: newVal }).eq('id', userId);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_statistiekenbeheerder: newVal } : u)),
    );
    setUpdating(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Gebruikersbeheer</h1>
        <p className="text-sm text-gray-500">
          {isHoofdbeheerder ? 'Rollen aanpassen van app-gebruikers' : 'Overzicht van app-gebruikers'}
        </p>
      </div>

      {/* Info */}
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
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const isOpen = expanded === user.id;
            const editable = canEdit(user.id);
            const isStat = user.is_statistiekenbeheerder ?? false;

            return (
              <div
                key={user.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                {/* Collapsed row */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : user.id)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left"
                >
                  <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {isHoofdbeheerder ? (user.naam || user.email) : (user.naam || 'Gebruiker')}
                    </p>
                    {isHoofdbeheerder && (
                      <p className="text-xs text-gray-400 truncate">{user.email}</p>
                    )}
                  </div>

                  {/* Role badge */}
                  <span
                    className={`text-xs font-semibold px-3 py-1.5 rounded-xl flex-shrink-0 ${rolColors[user.rol]}`}
                  >
                    {rolLabels[user.rol]}
                  </span>

                  {/* Statistiekenbeheerder badge */}
                  {isStat && (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-green-100 text-green-800 flex-shrink-0 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Statistieken
                    </span>
                  )}

                  {/* Self lock indicator */}
                  {!editable && user.id === profile?.id && (
                    <Lock className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  )}

                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-50 space-y-2">
                    {/* Mutually exclusive roles */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Rol
                      </p>
                      {rollen.map((rol) => {
                        const checked = user.rol === rol;
                        const disabled = !editable || updating === user.id;
                        return (
                          <button
                            key={rol}
                            type="button"
                            disabled={disabled}
                            onClick={() => updateRol(user.id, rol)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                              disabled
                                ? 'cursor-not-allowed opacity-60'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                                checked
                                  ? 'bg-blue-600 border-blue-600'
                                  : 'border-gray-300 bg-white'
                              }`}
                            >
                              {checked && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <span
                              className={`text-sm font-medium px-2 py-0.5 rounded-lg ${rolColors[rol]}`}
                            >
                              {rolLabels[rol]}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Independent statistiekenbeheerder */}
                    <div className="pt-2 mt-2 border-t border-gray-50">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Extra
                      </p>
                      <button
                        type="button"
                        disabled={!editable || updating === user.id}
                        onClick={() => toggleStatistiekenbeheerder(user.id, isStat)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                          !editable || updating === user.id
                            ? 'cursor-not-allowed opacity-60'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                            isStat
                              ? 'bg-green-600 border-green-600'
                              : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isStat && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <TrendingUp
                          className={`w-4 h-4 ${isStat ? 'text-green-600' : 'text-gray-400'}`}
                        />
                        <span
                          className={`text-sm font-medium ${isStat ? 'text-green-700' : 'text-gray-600'}`}
                        >
                          Statistiekenbeheerder
                        </span>
                      </button>
                    </div>

                    {!editable && user.id === profile?.id && (
                      <p className="text-xs text-gray-400 flex items-center gap-1.5 pt-1">
                        <Lock className="w-3 h-3" />
                        Je kunt je eigen rol niet aanpassen.
                      </p>
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
