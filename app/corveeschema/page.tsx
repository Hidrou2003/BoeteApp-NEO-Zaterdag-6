'use client';

import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { Sparkles } from 'lucide-react';
import { getISOWeek, getISOWeekYear, format } from 'date-fns';
import { nl } from 'date-fns/locale';

const najaar2026 = [
  { week: 36, namen: ['Guus', 'Haye', 'Hidde G'] },
  { week: 37, namen: ['Hidde R', 'Joep', 'Jorn'] },
  { week: 38, namen: ['Julian', 'Lucas', 'Max B'] },
  { week: 39, namen: ['Max N', 'Nick', 'Niek'] },
  { week: 40, namen: ['Rick', 'Thomas', 'Thijmen'] },
  { week: 41, namen: ['Tim', 'Bjorn', 'Emiel'] },
  { week: 42, namen: ['Ewen', 'Guus', 'Haye'] },
  { week: 43, namen: ['Hidde G', 'Hidde R', 'Joep'] },
  { week: 44, namen: ['Jorn', 'Julian', 'Lucas'] },
  { week: 45, namen: ['Max B', 'Max N', 'Nick'] },
  { week: 46, namen: ['Niek', 'Rick', 'Thomas'] },
  { week: 47, namen: ['Thijmen', 'Tim', 'Bjorn'] },
  { week: 48, namen: ['Emiel', 'Ewen', 'Guus'] },
  { week: 49, namen: ['Haye', 'Hidde G', 'Hidde R'], winterstop: true },
];

const voorjaar2027 = [
  { week: 3, namen: ['Joep', 'Jorn', 'Julian'] },
  { week: 4, namen: ['Lucas', 'Max B', 'Max N'] },
  { week: 5, namen: ['Nick', 'Niek', 'Rick'] },
  { week: 6, namen: ['Thomas', 'Thijmen', 'Tim'] },
  { week: 7, namen: ['Bjorn', 'Emiel', 'Ewen'] },
  { week: 8, namen: ['Guus', 'Haye', 'Hidde G'] },
  { week: 9, namen: ['Hidde R', 'Joep', 'Jorn'] },
  { week: 10, namen: ['Julian', 'Lucas', 'Max B'] },
  { week: 11, namen: ['Max N', 'Nick', 'Niek'] },
  { week: 12, namen: ['Rick', 'Thomas', 'Thijmen'] },
  { week: 13, namen: ['Tim', 'Bjorn', 'Emiel'] },
  { week: 14, namen: ['Ewen', 'Guus', 'Haye'] },
  { week: 15, namen: ['Hidde G', 'Hidde R', 'Joep'] },
  { week: 16, namen: ['Jorn', 'Julian', 'Lucas'] },
  { week: 17, namen: ['Max B', 'Max N', 'Nick'] },
  { week: 18, namen: ['Niek', 'Rick', 'Thomas'] },
  { week: 19, namen: ['Thijmen', 'Tim', 'Bjorn'] },
  { week: 20, namen: ['Emiel', 'Ewen', 'Guus'] },
];

export default function CorveeschemaPage() {
  return (
    <AuthGuard>
      <AppShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Corveeschema</h1>
            <p className="text-sm text-gray-500">NEO Zaterdag 6 — Seizoen 2026/2027</p>
          </div>

          <SeizoenSection title="Najaar 2026" year={2026} weken={najaar2026} />
          <SeizoenSection title="Voorjaar 2027" year={2027} weken={voorjaar2027} />
        </div>
      </AppShell>
    </AuthGuard>
  );
}

function weekDateRange(year: number, weekNr: number): string {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay();
  const isoWeek1Monday = new Date(jan4);
  isoWeek1Monday.setDate(jan4.getDate() - ((jan4Day + 6) % 7));
  const weekMonday = new Date(isoWeek1Monday);
  weekMonday.setDate(isoWeek1Monday.getDate() + (weekNr - 1) * 7);
  const sunday = new Date(weekMonday);
  sunday.setDate(weekMonday.getDate() + 6);
  return `${format(weekMonday, 'dd MMM yyyy', { locale: nl })} t/m ${format(sunday, 'dd MMM yyyy', { locale: nl })}`;
}

function SeizoenSection({ title, year, weken }: { title: string; year: number; weken: { week: number; namen: string[]; winterstop?: boolean }[] }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {weken.map((item, i) => (
          <div key={item.week}>
            <div className="flex items-center gap-4 px-4 py-3">
              <div className="w-20 flex-shrink-0">
                <p className="text-xs font-semibold text-gray-400 uppercase">Week {item.week}</p>
                <p className="text-[11px] text-gray-400 leading-tight">{weekDateRange(year, item.week)}</p>
              </div>
              <div className="flex-1 flex flex-wrap gap-1.5">
                {item.namen.map((naam, j) => (
                  <span key={j} className="text-sm bg-blue-50 text-blue-800 font-medium px-2.5 py-1 rounded-lg">{naam}</span>
                ))}
              </div>
              {item.winterstop && (
                <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-lg flex-shrink-0">Winterstop</span>
              )}
            </div>
            {i < weken.length - 1 && <div className="h-px bg-gray-50 mx-4" />}
          </div>
        ))}
      </div>
    </section>
  );
}
