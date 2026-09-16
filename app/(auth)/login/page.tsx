'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { CheckCircle, Eye, EyeOff, Trophy, Mail } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [naam, setNaam] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message || 'Onjuiste e-mail of wachtwoord.');
    } else {
      // Fetch profile to determine redirect based on role
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('rol').eq('id', user.id).maybeSingle();
        if (prof?.rol === 'kijker') {
          router.push('/weekoverzicht');
        } else {
          router.push('/');
        }
      } else {
        router.push('/');
      }
    }
    setLoading(false);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { naam } },
    });
    if (error) {
      setError(error.message === 'User already registered' ? 'Dit e-mailadres is al in gebruik.' : error.message);
    } else {
      setSignupSuccess(true);
    }
    setLoading(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/(auth)/login`,
    });
    if (error) {
      setError(error.message || 'Kon geen resetmail versturen. Probeer het opnieuw.');
    } else {
      setResetSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Boete App</h1>
          <p className="text-blue-200 text-sm mt-1 font-medium">NEO Zaterdag 6</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex">
            <button
              onClick={() => { setTab('login'); setError(''); }}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${tab === 'login' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              Inloggen
            </button>
            <button
              onClick={() => { setTab('signup'); setError(''); }}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${tab === 'signup' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              Account aanmaken
            </button>
          </div>

          {signupSuccess ? (
            <div className="p-6 space-y-4 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Controleer je e-mail</h2>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  We hebben een bevestigingsmail gestuurd naar <strong className="text-gray-800">{email}</strong>. Klik op de link in de mail om je account te activeren. Daarna kun je inloggen.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Tip: geen mail ontvangen? Controleer je spam- of ongewenste e-mailmap.
                </p>
              </div>
              <button
                onClick={() => { setSignupSuccess(false); setTab('login'); }}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition-all text-sm shadow-md shadow-blue-200"
              >
                Naar inloggen
              </button>
            </div>
          ) : resetMode ? (
            <div className="p-6 space-y-4">
              {resetSent ? (
                <div className="space-y-4 text-center">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <Mail className="w-7 h-7 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Resetlink verstuurd</h2>
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                      We hebben een e-mail gestuurd naar <strong className="text-gray-800">{email}</strong> met een link om je wachtwoord te wijzigen. Controleer ook je spammap.
                    </p>
                  </div>
                  <button
                    onClick={() => { setResetMode(false); setResetSent(false); setTab('login'); }}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition-all text-sm shadow-md shadow-blue-200"
                  >
                    Terug naar inloggen
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-1">Wachtwoord vergeten?</h2>
                    <p className="text-sm text-gray-500 mb-4">Vul je e-mailadres in. We sturen je een link om een nieuw wachtwoord in te stellen.</p>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">E-mailadres</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder="naam@email.nl"
                      autoFocus
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-blue-200"
                  >
                    {loading ? 'Even wachten...' : 'Resetlink versturen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setResetMode(false); setError(''); setTab('login'); }}
                    className="w-full text-gray-500 font-medium py-2 text-sm hover:text-gray-700"
                  >
                    Terug naar inloggen
                  </button>
                </form>
              )}
            </div>
          ) : (
          <form onSubmit={tab === 'login' ? handleLogin : handleSignup} className="p-6 space-y-4">
            {tab === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Naam</label>
                <input
                  type="text"
                  value={naam}
                  onChange={e => setNaam(e.target.value)}
                  required
                  placeholder="Jouw naam"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">E-mailadres</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="naam@email.nl"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Wachtwoord</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-blue-200 mt-2"
            >
              {loading ? 'Even wachten...' : tab === 'login' ? 'Inloggen' : 'Account aanmaken'}
            </button>

            {tab === 'login' && (
              <button
                type="button"
                onClick={() => { setResetMode(true); setError(''); }}
                className="w-full text-blue-600 font-medium text-sm hover:text-blue-800 transition-colors"
              >
                Wachtwoord vergeten?
              </button>
            )}
          </form>
          )}
        </div>

        <p className="text-center text-blue-200 text-xs mt-6">
          Nieuwe accounts krijgen automatisch de Kijker-rol
        </p>
      </div>
    </div>
  );
}
