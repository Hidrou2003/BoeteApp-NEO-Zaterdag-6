'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Trophy, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check if we have a valid session from the reset link
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setReady(true);
      } else {
        // No session means the link is invalid or expired
        setError('De resetlink is ongeldig of verlopen. Vraag een nieuwe aan.');
        setReady(false);
      }
    };
    checkSession();
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Wachtwoord moet minimaal 6 tekens lang zijn.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('De wachtwoorden komen niet overeen.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setError(error.message || 'Kon wachtwoord niet wijzigen.');
      setLoading(false);
      return;
    }

    // Sign out so user has to log in again with new password
    await supabase.auth.signOut();
    setSuccess(true);
    setLoading(false);

    // Redirect to login after 3 seconds
    setTimeout(() => {
      router.push('/(auth)/login');
    }, 3000);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Boete App</h1>
          <p className="text-blue-200 text-sm mt-1 font-medium">NEO Zaterdag 6</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {success ? (
            <div className="p-6 space-y-4 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Wachtwoord gewijzigd</h2>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  Je wachtwoord is succesvol gewijzigd. Je wordt doorgestuurd naar het inlogscherm om opnieuw in te loggen met je nieuwe wachtwoord.
                </p>
              </div>
            </div>
          ) : !ready && error ? (
            <div className="p-6 space-y-4 text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Link ongeldig</h2>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{error}</p>
              </div>
              <button
                onClick={() => router.push('/(auth)/login')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-all text-sm shadow-md shadow-blue-200"
              >
                Naar inloggen
              </button>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-lg font-bold text-gray-900">Nieuw wachtwoord</h2>
                <p className="text-sm text-gray-500 mt-1">Stel je nieuwe wachtwoord in.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Nieuw wachtwoord</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    minLength={6}
                    autoFocus
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

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Bevestig wachtwoord</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  minLength={6}
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
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-blue-200 mt-2"
              >
                {loading ? 'Even wachten...' : 'Wachtwoord wijzigen'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
