'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, AanwezigheidEvenement } from '@/lib/supabase';
import { ArrowLeft, Zap, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

export default function NieuweActiviteitPage() {
  return (
    <AuthGuard>
      <AppShell>
        <NieuweActiviteitContent />
      </AppShell>
    </AuthGuard>
  );
}

function NieuweActiviteitContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [naam, setNaam] = useState('');
  const [datum, setDatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isDubbel, setIsDubbel] = useState(false);
  const [isDubbeleMaand, setIsDubbeleMaand] = useState(false);
  const [aanwezigheidEvenementId, setAanwezigheidEvenementId] = useState('');
  const [aanwezigheidEvenementen, setAanwezigheidEvenementen] = useState<AanwezigheidEvenement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isBeheerder = profile?.rol === 'beheerder' || profile?.rol === 'hoofdbeheerder';

  useEffect(() => {
    if (!isBeheerder) return;
    supabase.from('aanwezigheid_evenementen').select('*').order('deadline', { ascending: false }).then(({ data }) => {
      setAanwezigheidEvenementen((data ?? []) as AanwezigheidEvenement[]);
    });
  }, [isBeheerder]);

  if (!isBeheerder) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="font-medium">Geen toegang</p>
        <p className="text-sm mt-1">Alleen beheerders mogen activiteiten aanmaken.</p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!naam.trim()) { setError('Voer een naam in.'); return; }
    setLoading(true);
    setError('');

    const { data, error: err } = await supabase
      .from('activiteiten')
      .insert({
        naam: naam.trim(),
        datum,
        is_dubbel: isDubbel,
        is_dubbele_maand: isDubbeleMaand,
        aanwezigheid_evenement_id: aanwezigheidEvenementId || null,
        gemaakt_door: profile!.id,
        gemaakt_op: new Date().toISOString(),
      })
      .select()
      .single();

    if (err || !data) {
      setError(err?.message || 'Er ging iets mis. Probeer het opnieuw.');
      setLoading(false);
      return;
    }

    router.push(`/activiteit/${data.id}/flow`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nieuwe activiteit</h1>
          <p className="text-sm text-gray-500">Vul de details in om te starten</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Naam activiteit</label>
            <input
              type="text"
              value={naam}
              onChange={e => setNaam(e.target.value)}
              placeholder="bijv. Training, Wedstrijd vs. Rivaal..."
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Datum</label>
            <input
              type="date"
              value={datum}
              onChange={e => setDatum(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Koppelen aan aanwezigheid</label>
            <select
              value={aanwezigheidEvenementId}
              onChange={e => setAanwezigheidEvenementId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="">Geen koppeling</option>
              {aanwezigheidEvenementen.map(event => (
                <option key={event.id} value={event.id}>{event.naam} — deadline {new Date(event.deadline).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-400">Koppel een eerder aangemaakte aanwezigheid aan deze activiteit.</p>
          </div>

          {/* Dubbele activiteit toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Opties</label>
            <button
              type="button"
              onClick={() => setIsDubbel(!isDubbel)}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition-all ${
                isDubbel ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDubbel ? 'bg-orange-100' : 'bg-gray-100'}`}>
                  <Zap className={`w-4 h-4 ${isDubbel ? 'text-orange-600' : 'text-gray-400'}`} />
                </div>
                <div className="text-left">
                  <p className={`text-sm font-semibold ${isDubbel ? 'text-orange-900' : 'text-gray-700'}`}>Dubbele activiteit</p>
                  <p className={`text-xs ${isDubbel ? 'text-orange-600' : 'text-gray-400'}`}>Verdubbelbare boetes tellen als x2</p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${isDubbel ? 'bg-orange-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
              </div>
            </button>
          </div>

          {/* Dubbele maand toggle */}
          <div>
            <button
              type="button"
              onClick={() => setIsDubbeleMaand(!isDubbeleMaand)}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition-all ${
                isDubbeleMaand ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDubbeleMaand ? 'bg-purple-100' : 'bg-gray-100'}`}>
                  <Calendar className={`w-4 h-4 ${isDubbeleMaand ? 'text-purple-600' : 'text-gray-400'}`} />
                </div>
                <div className="text-left">
                  <p className={`text-sm font-semibold ${isDubbeleMaand ? 'text-purple-900' : 'text-gray-700'}`}>Dubbele maand</p>
                  <p className={`text-xs ${isDubbeleMaand ? 'text-purple-600' : 'text-gray-400'}`}>Alle boetes worden verdubbeld (ook niet-verdubbelbare)</p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${isDubbeleMaand ? 'bg-purple-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
              </div>
            </button>
            {isDubbel && isDubbeleMaand && (
              <p className="text-xs text-purple-600 mt-1.5 px-1">Let op: verdubbelbare boetes worden x4 (eerst x2 door dubbele activiteit, dan nogmaals x2 door dubbele maand).</p>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-4 rounded-2xl transition-colors shadow-md shadow-blue-100 disabled:opacity-60 text-base"
        >
          {loading ? 'Aanmaken...' : 'Activiteit aanmaken & starten'}
        </button>
      </form>
    </div>
  );
}
