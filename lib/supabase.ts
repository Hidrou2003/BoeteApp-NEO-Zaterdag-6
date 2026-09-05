'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Rol = 'hoofdbeheerder' | 'beheerder' | 'kijker';

export interface Wedstrijd {
  id: string;
  datum: string;
  tegenstander: string;
  locatie: string | null;
  gemaakt_door: string | null;
  created_at: string;
}

export interface WedstrijdSpelerStats {
  id: string;
  wedstrijd_id: string;
  speler_id: string;
  goals: number;
  assists: number;
  gele_kaarten: number;
  rode_kaarten: number;
  eigen_goals: number;
  created_at: string;
  spelers?: Speler;
}

export interface Profile {
  id: string;
  email: string;
  naam: string;
  rol: Rol;
  is_statistiekenbeheerder: boolean;
  created_at: string;
}

export interface Speler {
  id: string;
  naam: string;
  actief: boolean;
  created_at: string;
  profile_id?: string | null;
  max_ongeoorloord?: number;
  doe_mee_aan_boetes?: boolean;
}

export interface Boetecategorie {
  id: string;
  naam: string;
  titel?: string | null;
  bedrag: number; // in cents
  verdubbelbaar: boolean;
  open_bedrag: boolean;
  is_teamboete: boolean;
  actief: boolean;
  volgorde: number;
  created_at: string;
}

export interface Activiteit {
  id: string;
  naam: string;
  datum: string;
  is_dubbel: boolean;
  is_dubbele_maand: boolean;
  afgerond: boolean;
  created_at: string;
  gemaakt_door?: string | null;
  gewijzigd_door?: string | null;
  gemaakt_op?: string | null;
  gewijzigd_op?: string | null;
  gemaakt_door_profile?: Profile | null;
  gewijzigd_door_profile?: Profile | null;
  laatste_speler_index?: number;
}

export interface ActiviteitSpeler {
  id: string;
  activiteit_id: string;
  speler_id: string;
  aanwezigheid: 'aanwezig' | 'geoorloofd_afwezig' | 'ongeoorloofd_afwezig' | null;
  eigen_boetes_totaal: number;
  gemiddeld_bedrag: number;
  opslag_bedrag: number;
  totaal_bedrag: number;
  created_at: string;
  spelers?: Speler;
  boete_items?: BoeteItem[];
}

export interface BoeteItem {
  id: string;
  activiteit_speler_id: string;
  categorie_id: string;
  aantal: number;
  bedrag_per_stuk: number;
  subtotaal: number;
  created_at: string;
  boetecategorieen?: Boetecategorie;
}

export interface OverigeBoete {
  id: string;
  speler_id: string;
  activiteit_id?: string | null;
  omschrijving: string;
  bedrag: number;
  datum: string;
  created_at: string;
  spelers?: Speler;
}

export type BetaalStatus = 'betaald' | 'te_laag_betaald' | 'niet_betaald' | 'te_weinig_betaald' | 'niet_gedeeld' | null;

export interface Betaling {
  id: string;
  speler_id: string;
  week_key: string;
  betaal_status: BetaalStatus;
  te_weinig_bedrag: number;
  created_at: string;
  updated_at: string;
  spelers?: Speler;
}

export interface AppInstellingen {
  id: number;
  nul_euro_is_twee_euro: boolean;
  betaal_url: string | null;
  betaal_link_actief: boolean;
  gemini_api_key: string | null;
  created_at: string;
  updated_at: string;
}

export const REGELS_PREFIX = '__REGELS__';
export const GEMINI_PREFIX = '__GEMINI__';
export const BOETEPOT_PREFIX = '__BOETEPOT__';

export function extractBoetepotBasis(categorieen: Boetecategorie[]): { basis: number; vanafWeek: string | null } {
  const cat = categorieen.find(c => c.naam.startsWith(BOETEPOT_PREFIX));
  if (!cat) return { basis: 0, vanafWeek: null };
  const payload = cat.naam.slice(BOETEPOT_PREFIX.length);
  const [basisStr, vanafWeek] = payload.split('|');
  return { basis: parseInt(basisStr, 10) || 0, vanafWeek: vanafWeek || null };
}

export function extractRegelsTekst(categorieen: Boetecategorie[]): string {
  const cat = categorieen.find(c => c.naam.startsWith(REGELS_PREFIX));
  return cat ? cat.naam.slice(REGELS_PREFIX.length) : '';
}

export function extractGeminiKey(categorieen: Boetecategorie[]): string {
  const cat = categorieen.find(c => c.naam.startsWith(GEMINI_PREFIX));
  return cat ? cat.naam.slice(GEMINI_PREFIX.length) : '';
}

export interface BetaalLink {
  id: string;
  week_key: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface BankScreenshot {
  id: string;
  week_key: string;
  storage_path: string;
  ocr_result: OcrEntry[] | null;
  created_at: string;
}

export interface OcrEntry {
  naam: string;
  bedrag: string;
  bedrag_cents: number;
  speler_id: string | null;
  matched_status: 'betaald' | 'te_weinig_betaald' | 'niet_betaald' | 'te_laag_betaald' | null;
}

export interface NaamAlias {
  id: string;
  speler_id: string;
  alias: string;
  created_at: string;
}

export function formatBedrag(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Calculate the fine amount for a category, considering is_dubbel and is_dubbele_maand.
 * - If is_dubbel AND cat.verdubbelbaar: bedrag * 2
 * - If is_dubbele_maand: multiply by 2 again (so verdubbelbaar on dubbele maand = x4)
 * - Non-verdubbelbaar fines are only doubled by is_dubbele_maand, not by is_dubbel
 */
export function calcBedrag(cat: Boetecategorie, isDubbel: boolean, isDubbeleMaand: boolean): number {
  let bedrag = cat.bedrag;
  if (isDubbel && cat.verdubbelbaar) bedrag *= 2;
  if (isDubbeleMaand) bedrag *= 2;
  return bedrag;
}

