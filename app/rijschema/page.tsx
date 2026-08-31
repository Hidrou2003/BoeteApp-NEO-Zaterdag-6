'use client';

import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { Car, MapPin } from 'lucide-react';

const rijschema = [
  { datum: 'Za 05-09-2026', tijd: '14:30', wedstrijd: 'Hulzense Boys 3 – NEO 6', chauffeurs: ['Ewen', 'Max B', 'Thijmen', 'Nick'] },
  { datum: 'Za 19-09-2026', tijd: '16:00', wedstrijd: 'De Tukkers 3 – NEO 6', chauffeurs: ['Nick', 'Guus', 'Jorn', 'Niek'] },
  { datum: 'Za 03-10-2026', tijd: '16:00', wedstrijd: "Achilles '12 3 – NEO 6", chauffeurs: ['Rick', 'Niek', 'Max N', 'Hidde R'] },
  { datum: 'Za 24-10-2026', tijd: '14:30', wedstrijd: 'RKSV Bornerbroek 2 – NEO 6', chauffeurs: ['Lucas', 'Joep', 'Thomas', 'Tim'] },
  { datum: 'Za 07-11-2026', tijd: '12:30', wedstrijd: 'ESC Glanerbrug 3 – NEO 6', chauffeurs: ['Julian', 'Haye', 'Emiel', 'Bjorn'] },
  { datum: 'Za 28-11-2026', tijd: '14:45', wedstrijd: 'PH 4 – NEO 6', chauffeurs: ['Ewen', 'Max B', 'Thijmen', 'Hidde G'] },
  { datum: 'Za 05-12-2026', tijd: '12:30', wedstrijd: 'FC Aramea 2 – NEO 6', chauffeurs: ['Rick', 'Guus', 'Jorn', 'Max N'] },
  { datum: 'Za 23-01-2027', tijd: '14:45', wedstrijd: "Quick '20 4 – NEO 6", chauffeurs: ['Jorn', 'Niek', 'Max N', 'Hidde R'] },
  { datum: 'Za 13-03-2027', tijd: '16:30', wedstrijd: 'S.V. Losser 4 – NEO 6', chauffeurs: ['Lucas', 'Joep', 'Thomas', 'Tim'] },
  { datum: 'Za 03-04-2027', tijd: '15:00', wedstrijd: 'Bon Boys 4 – NEO 6', chauffeurs: ['Julian', 'Haye', 'Emiel', 'Bjorn'] },
  { datum: 'Za 24-04-2027', tijd: '12:30', wedstrijd: 'Oranje Nassau 4 – NEO 6', chauffeurs: ['Max B', 'Thijmen', 'Thomas', 'Hidde G'] },
  { datum: 'Za 22-05-2027', tijd: '14:30', wedstrijd: 'Fiets', chauffeurs: ['Fiets'], isFiets: true },
];

export default function RijschemaPage() {
  return (
    <AuthGuard>
      <AppShell>
        <div className="space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Rijschema</h1>
            <p className="text-sm text-gray-500">NEO Zaterdag 6 — Seizoen 2026/2027</p>
          </div>

          <div className="space-y-3">
            {rijschema.map((item, i) => {
              const isFiets = item.isFiets ?? false;
              return (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Car className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-blue-700">{item.datum} — {item.tijd}</p>
                      {!isFiets && <p className="text-sm font-semibold text-gray-900 truncate">{item.wedstrijd}</p>}
                    </div>
                  </div>
                  <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    {isFiets ? (
                      <span className="text-sm text-green-700 font-semibold">Fiets</span>
                    ) : item.chauffeurs.map((c, j) => (
                      <span key={j} className="text-sm bg-blue-50 text-blue-800 font-medium px-2.5 py-1 rounded-lg">{c}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}
