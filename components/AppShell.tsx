'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  Trophy,
  Menu,
  X,
  Home,
  BarChart3,
  Settings,
  LogOut,
  CreditCard,
  Car,
  Calendar,
  CalendarCheck,
  Sparkles,
  ChevronRight,
  Users,
  TrendingUp,
} from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  const isBeheerder = profile?.rol === 'beheerder' || profile?.rol === 'hoofdbeheerder';
  const isHoofdbeheerder = profile?.rol === 'hoofdbeheerder';
  const isKijker = profile?.rol === 'kijker';
  const isStatistiekenbeheerder = profile?.is_statistiekenbeheerder ?? false;

  const rolLabel: Record<string, string> = {
    hoofdbeheerder: 'Hoofdbeheerder',
    beheerder: 'Beheerder',
    kijker: 'Kijker',
  };
  const rolColor: Record<string, string> = {
    hoofdbeheerder: 'bg-amber-100 text-amber-800',
    beheerder: 'bg-blue-100 text-blue-800',
    kijker: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-blue-700 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Left: hamburger */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              className="p-2 rounded-lg hover:bg-white/15 active:bg-white/25 transition-colors"
              aria-label="Menu openen"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          {/* Center: title */}
          <Link href="/" className="absolute left-1/2 -translate-x-1/2 text-center">
            <p className="font-bold text-base leading-tight">Boete App</p>
            <p className="text-blue-200 text-xs leading-tight font-medium">NEO Zaterdag 6</p>
          </Link>

          {/* Right: spacer to balance */}
          <div className="w-10" />
        </div>
      </header>

      {/* Slide-in menu overlay */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed top-0 left-0 z-50 h-full w-72 bg-white shadow-2xl flex flex-col">
            {/* Menu header */}
            <div className="bg-blue-700 text-white px-5 pt-12 pb-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-base">Boete App</p>
                    <p className="text-blue-200 text-xs">NEO Zaterdag 6</p>
                  </div>
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/15"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {profile && (
                <div className="bg-white/10 rounded-xl px-3 py-2.5">
                  <p className="text-sm font-semibold truncate">{profile.naam || profile.email}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rolColor[profile.rol] ?? 'bg-gray-100 text-gray-600'}`}>
                      {rolLabel[profile.rol] ?? profile.rol}
                    </span>
                    {(profile.is_statistiekenbeheerder ?? false) && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                        Statistiekenbeheerder
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <NavItem href="/aanwezigheid" icon={<CalendarCheck className="w-5 h-5" />} label="Aanwezigheid" active={pathname === '/aanwezigheid'} />
              {!isKijker && (
                <NavItem href="/" icon={<Home className="w-5 h-5" />} label="Activiteiten" active={pathname === '/'} />
              )}
              <NavItem href="/weekoverzicht" icon={<BarChart3 className="w-5 h-5" />} label="Boetes" active={pathname === '/weekoverzicht'} />
              <NavItem href="/betaling" icon={<CreditCard className="w-5 h-5" />} label="Betaling" active={pathname === '/betaling'} />
              <NavItem href="/opkomst" icon={<Calendar className="w-5 h-5" />} label="Opkomst" active={pathname === '/opkomst'} />
              <NavItem href="/statistieken" icon={<TrendingUp className="w-5 h-5" />} label="Statistieken" active={pathname === '/statistieken'} />
              <NavItem href="/rijschema" icon={<Car className="w-5 h-5" />} label="Rijschema" active={pathname === '/rijschema'} />
              <NavItem href="/corveeschema" icon={<Sparkles className="w-5 h-5" />} label="Corveeschema" active={pathname === '/corveeschema'} />
              {!isKijker && (
                <NavItem href="/beheer" icon={<Users className="w-5 h-5" />} label="Gebruikersbeheer" active={pathname === '/beheer'} />
              )}
              <NavItem href="/instellingen" icon={<Settings className="w-5 h-5" />} label="Instellingen" active={pathname === '/instellingen'} />
            </nav>

            {/* Sign out */}
            <div className="px-3 pb-6 border-t border-gray-100 pt-3">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors text-sm font-medium"
              >
                <LogOut className="w-5 h-5" />
                Uitloggen
              </button>
            </div>
          </div>
        </>
      )}

      {/* Page content */}
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-5">
        {children}
      </main>
    </div>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-sm font-medium ${
        active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <span className={active ? 'text-blue-600' : 'text-gray-500'}>{icon}</span>
      <span className="flex-1">{label}</span>
      {active && <ChevronRight className="w-4 h-4 text-blue-400" />}
    </Link>
  );
}
