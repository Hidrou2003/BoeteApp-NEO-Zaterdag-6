'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth-context';
import { supabase, Speler, Boetecategorie, Profile, NaamAlias, AppInstellingen, formatBedrag, REGELS_PREFIX, extractRegelsTekst } from '@/lib/supabase';
import { Settings, Plus, Trash2, Pencil, X, Check, Users, Tag, Zap, Lock, Euro, Shield, UserCheck, AlertCircle, Mail, UserCircle, TrendingUp, FileText, Key, MoreHorizontal } from 'lucide-react';

export default function InstellingenPage() {
  return (
    <AuthGuard>
      <AppShell>
        <InstellingenContent />
      </AppShell>
    </AuthGuard>
  );
}

function InstellingenContent() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'spelers' | 'boetelijst' | 'overig'>('spelers');
  const [spelers, setSpelers] = useState<Speler[]>([]);
  const [categorieen, setCategorieen] = useState<Boetecategorie[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [aliases, setAliases] = useState<(NaamAlias & { spelers?: Speler })[]>([]);
  const [instellingen, setInstellingen] = useState<AppInstellingen | null>(null);
  const [loading, setLoading] = useState(true);

  const isBeheerder = profile?.rol === 'beheerder' || profile?.rol === 'hoofdbeheerder';
  const isHoofdbeheerder = profile?.rol === 'hoofdbeheerder';

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: sps }, { data: cats }, { data: profs }, { data: al }, { data: inst }] = await Promise.all([
      supabase.from('spelers').select('*').order('naam'),
      supabase.from('boetecategorieen').select('*').order('volgorde'),
      supabase.from('profiles').select('*').order('naam'),
      supabase.from('naam_aliases').select('*, spelers(*)').order('alias'),
      supabase.from('app_instellingen').select('*').eq('id', 1).maybeSingle(),
    ]);
    setSpelers(sps ?? []);
    setCategorieen(cats ?? []);
    setProfiles(profs ?? []);
    setAliases(al ?? []);
    setInstellingen(inst as AppInstellingen | null);
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Instellingen</h1>
        <p className="text-sm text-gray-500">
          {isHoofdbeheerder ? 'Spelers, boetelijst en overige instellingen beheren' : 'Spelers, boetelijst en overige instellingen bekijken'}
        </p>
      </div>

      {!isHoofdbeheerder && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <Lock className="w-4 h-4 flex-shrink-0" />
          <p>Alleen hoofdbeheerders kunnen wijzigingen aanbrengen.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('spelers')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'spelers' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Users className="w-4 h-4" />
          Spelers
        </button>
        <button
          onClick={() => setTab('boetelijst')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'boetelijst' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Tag className="w-4 h-4" />
          Boetelijst
        </button>
        <button
          onClick={() => setTab('overig')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'overig' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <MoreHorizontal className="w-4 h-4" />
          Overig
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : tab === 'spelers' ? (
        <SpelersTab spelers={spelers} profiles={profiles} aliases={aliases} isHoofdbeheerder={isHoofdbeheerder} onChanged={load} />
      ) : tab === 'boetelijst' ? (
        <BoetelijstTab categorieen={categorieen} instellingen={instellingen} isHoofdbeheerder={isHoofdbeheerder} onChanged={load} />
      ) : tab === 'overig' ? (
        <OverigTab instellingen={instellingen} isHoofdbeheerder={isHoofdbeheerder} onChanged={load} />
      ) : null}
    </div>
  );
}

// ============================================================
// SPELERS TAB
// ============================================================
function SpelersTab({ spelers, profiles, aliases, isHoofdbeheerder, onChanged }: {
  spelers: Speler[];
  profiles: Profile[];
  aliases: (NaamAlias & { spelers?: Speler })[];
  isHoofdbeheerder: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newNaam, setNewNaam] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNaam, setEditNaam] = useState('');
  const [editMaxOngeoorloord, setEditMaxOngeoorloord] = useState(5);
  const [editProfileId, setEditProfileId] = useState<string | null>(null);
  const [editDoeMeeAanBoetes, setEditDoeMeeAanBoetes] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedAliases, setExpandedAliases] = useState<string | null>(null);
  const [newAlias, setNewAlias] = useState('');
  const [addingAliasFor, setAddingAliasFor] = useState<string | null>(null);

  const aliasesBySpeler = new Map<string, NaamAlias[]>();
  for (const a of aliases) {
    const list = aliasesBySpeler.get(a.speler_id) ?? [];
    list.push(a);
    aliasesBySpeler.set(a.speler_id, list);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newNaam.trim()) return;
    setSaving(true);
    await supabase.from('spelers').insert({ naam: newNaam.trim() });
    setNewNaam('');
    setAdding(false);
    setSaving(false);
    onChanged();
  }

  async function handleDelete(id: string) {
    await supabase.from('spelers').update({ actief: false }).eq('id', id);
    onChanged();
  }

  async function handleEditSave(sp: Speler) {
    if (!editNaam.trim()) return;
    setSaving(true);
    await supabase.from('spelers').update({
      naam: editNaam.trim(),
      max_ongeoorloord: editMaxOngeoorloord,
      profile_id: editProfileId,
      doe_mee_aan_boetes: editDoeMeeAanBoetes,
    }).eq('id', sp.id);
    setEditingId(null);
    setSaving(false);
    onChanged();
  }

  async function addAlias(spelerId: string) {
    if (!newAlias.trim()) return;
    await supabase.from('naam_aliases').insert({ alias: newAlias.trim(), speler_id: spelerId });
    setNewAlias('');
    setAddingAliasFor(null);
    onChanged();
  }

  async function deleteAlias(id: string) {
    await supabase.from('naam_aliases').delete().eq('id', id);
    onChanged();
  }

  const actief = spelers.filter(s => s.actief);
  const inactief = spelers.filter(s => !s.actief);

  return (
    <div className="space-y-4">
      {/* Add button / form */}
      {isHoofdbeheerder && (
        adding ? (
          <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <input
              type="text"
              value={newNaam}
              onChange={e => setNewNaam(e.target.value)}
              placeholder="Naam van de speler"
              autoFocus
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button type="submit" disabled={saving} className="w-10 h-10 bg-green-600 text-white rounded-xl flex items-center justify-center hover:bg-green-700 transition-colors disabled:opacity-60 flex-shrink-0">
              <Check className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => { setAdding(false); setNewNaam(''); }} className="w-10 h-10 bg-gray-100 text-gray-500 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-sm text-sm"
          >
            <Plus className="w-4 h-4" />
            Speler toevoegen
          </button>
        )
      )}

      {/* Active players */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
        {actief.map(sp => {
          const linkedProfile = profiles.find(p => p.id === sp.profile_id);
          const spelerAliases = aliasesBySpeler.get(sp.id) ?? [];
          const hasEmail = !!linkedProfile;
          const hasAliases = spelerAliases.length > 0;
          const showWarning = !hasEmail || !hasAliases;
          const isExpanded = expandedAliases === sp.id;

          return (
            <div key={sp.id} className="px-4 py-3.5">
              {editingId === sp.id && isHoofdbeheerder ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editNaam}
                      onChange={e => setEditNaam(e.target.value)}
                      autoFocus
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={() => handleEditSave(sp)} disabled={saving} className="w-8 h-8 bg-green-600 text-white rounded-lg flex items-center justify-center hover:bg-green-700 transition-colors disabled:opacity-60">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Max ongeoorloord */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Max ongeoorloord afwezig</label>
                    <input
                      type="number"
                      value={editMaxOngeoorloord}
                      onChange={e => setEditMaxOngeoorloord(parseInt(e.target.value) || 5)}
                      min={1}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Boven dit aantal gaat de opslag van EUR 2 naar EUR 4.</p>
                  </div>
                  {/* Doet mee aan boetes toggle */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setEditDoeMeeAanBoetes(!editDoeMeeAanBoetes)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${editDoeMeeAanBoetes ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Euro className={`w-4 h-4 ${editDoeMeeAanBoetes ? 'text-blue-600' : 'text-gray-400'}`} />
                        <div className="text-left">
                          <span className={`text-sm font-medium block ${editDoeMeeAanBoetes ? 'text-blue-900' : 'text-gray-600'}`}>Doet mee aan boetes</span>
                          <span className="text-xs text-gray-400">Uitzetten voor spelers die alleen voor statistieken meedoen</span>
                        </div>
                      </div>
                      <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${editDoeMeeAanBoetes ? 'bg-blue-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                        <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
                      </div>
                    </button>
                  </div>
                  {/* Profile linking */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Koppel aan gebruiker (email)</label>
                    <select
                      value={editProfileId ?? ''}
                      onChange={e => setEditProfileId(e.target.value || null)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Niet gekoppeld</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.naam || p.email} ({p.email})</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-800">{sp.naam}</span>
                        {showWarning && (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {sp.doe_mee_aan_boetes === false && (
                          <span className="text-xs bg-green-100 text-green-700 font-medium px-1.5 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
                            <TrendingUp className="w-2.5 h-2.5" />Alleen statistieken
                          </span>
                        )}
                        {linkedProfile ? (
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3 text-green-600" />
                            <span className="text-xs text-green-600 truncate">{linkedProfile.email}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            Geen email
                          </span>
                        )}
                        <span className="text-xs text-gray-300">·</span>
                        {hasAliases ? (
                          <button
                            onClick={() => setExpandedAliases(isExpanded ? null : sp.id)}
                            className="text-xs text-green-600 flex items-center gap-1 hover:text-green-700"
                          >
                            <UserCheck className="w-3 h-3" />
                            {spelerAliases.length} naamkoppeling{spelerAliases.length !== 1 ? 'en' : ''}
                          </button>
                        ) : (
                          <span className="text-xs text-amber-600 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            Geen naamkoppeling
                          </span>
                        )}
                      </div>
                      {sp.max_ongeoorloord !== undefined && sp.max_ongeoorloord !== 5 && (
                        <p className="text-xs text-gray-400 mt-0.5">Max ongeoorloord: {sp.max_ongeoorloord}</p>
                      )}
                    </div>
                    {isHoofdbeheerder && (
                      <>
                        <button onClick={() => { setEditingId(sp.id); setEditNaam(sp.naam); setEditMaxOngeoorloord(sp.max_ongeoorloord ?? 5); setEditProfileId(sp.profile_id ?? null); setEditDoeMeeAanBoetes(sp.doe_mee_aan_boetes ?? true); }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(sp.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Aliases section - expandable */}
                  {isExpanded && (
                    <div className="mt-3 ml-12 space-y-2">
                      {spelerAliases.map(a => (
                        <div key={a.id} className="flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-2">
                          <UserCircle className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                          <span className="flex-1 text-xs font-medium text-gray-700">{a.alias}</span>
                          {isHoofdbeheerder && (
                            <button onClick={() => deleteAlias(a.id)} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      {isHoofdbeheerder && (
                        addingAliasFor === sp.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newAlias}
                              onChange={e => setNewAlias(e.target.value)}
                              placeholder="bijv. J. Jansen of Jan J"
                              autoFocus
                              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button onClick={() => addAlias(sp.id)} className="w-7 h-7 bg-green-600 text-white rounded-lg flex items-center justify-center hover:bg-green-700 transition-colors">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { setAddingAliasFor(null); setNewAlias(''); }} className="w-7 h-7 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingAliasFor(sp.id)}
                            className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-800"
                          >
                            <Plus className="w-3 h-3" />
                            Naamkoppeling toevoegen
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {/* Quick add alias when no aliases exist */}
                  {!hasAliases && isHoofdbeheerder && !isExpanded && (
                    <button
                      onClick={() => { setExpandedAliases(sp.id); setAddingAliasFor(sp.id); }}
                      className="mt-2 ml-12 flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-800"
                    >
                      <Plus className="w-3 h-3" />
                      Naamkoppeling toevoegen
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
        {actief.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">Nog geen spelers toegevoegd</p>}
      </div>

      {/* Inactive players - only for hoofdbeheerder */}
      {isHoofdbeheerder && inactief.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Inactief</p>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
            {inactief.map(sp => (
              <div key={sp.id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                <span className="flex-1 text-sm font-medium text-gray-500">{sp.naam}</span>
                <button
                  onClick={async () => { await supabase.from('spelers').update({ actief: true }).eq('id', sp.id); onChanged(); }}
                  className="text-xs text-blue-600 font-medium hover:text-blue-800"
                >
                  Heractiveren
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BOETELIJST TAB (categorieen + teamboetes + regels + 0=2 toggle)
// ============================================================
function BoetelijstTab({ categorieen, instellingen, isHoofdbeheerder, onChanged }: {
  categorieen: Boetecategorie[];
  instellingen: AppInstellingen | null;
  isHoofdbeheerder: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newNaam, setNewNaam] = useState('');
  const [newBedrag, setNewBedrag] = useState('');
  const [newDubbel, setNewDubbel] = useState(false);
  const [newOpenBedrag, setNewOpenBedrag] = useState(false);
  const [newIsTeam, setNewIsTeam] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNaam, setEditNaam] = useState('');
  const [editBedrag, setEditBedrag] = useState('');
  const [editDubbel, setEditDubbel] = useState(false);
  const [editOpenBedrag, setEditOpenBedrag] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRegels, setEditingRegels] = useState(false);
  const [regelsTekst, setRegelsTekst] = useState('');

  const actief = categorieen.filter(c => c.actief && !c.naam.startsWith(REGELS_PREFIX));
  const regulier = actief.filter(c => !c.is_teamboete);
  const teamboetes = actief.filter(c => c.is_teamboete);
  const regelsTekstValue = extractRegelsTekst(categorieen);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newNaam.trim()) return;
    setSaving(true);
    const bedrag = Math.round(parseFloat(newBedrag.replace(',', '.')) * 100) || 0;
    const maxVolgorde = categorieen.reduce((max, c) => Math.max(max, c.volgorde), 0);
    await supabase.from('boetecategorieen').insert({
      naam: newNaam.trim(),
      bedrag,
      verdubbelbaar: newDubbel,
      open_bedrag: newOpenBedrag,
      is_teamboete: newIsTeam,
      volgorde: maxVolgorde + 1,
    });
    setNewNaam(''); setNewBedrag(''); setNewDubbel(false); setNewOpenBedrag(false); setNewIsTeam(false);
    setAdding(false); setSaving(false);
    onChanged();
  }

  async function handleDelete(id: string) {
    await supabase.from('boetecategorieen').update({ actief: false }).eq('id', id);
    onChanged();
  }

  async function handleEditSave(cat: Boetecategorie) {
    if (!editNaam.trim()) return;
    setSaving(true);
    const bedrag = Math.round(parseFloat(editBedrag.replace(',', '.')) * 100) || 0;
    await supabase.from('boetecategorieen').update({
      naam: editNaam.trim(),
      bedrag,
      verdubbelbaar: editDubbel,
      open_bedrag: editOpenBedrag,
    }).eq('id', cat.id);
    setEditingId(null); setSaving(false);
    onChanged();
  }

  async function toggleNulIsTwee() {
    if (!isHoofdbeheerder) return;
    const newVal = !instellingen?.nul_euro_is_twee_euro;
    await supabase.from('app_instellingen').upsert({ id: 1, nul_euro_is_twee_euro: newVal });
    onChanged();
  }

  async function saveRegelsTekst() {
    setSaving(true);
    const existingRegelsCat = categorieen.find(c => c.naam.startsWith(REGELS_PREFIX));
    const text = regelsTekst.trim();
    if (existingRegelsCat) {
      if (text) {
        await supabase.from('boetecategorieen').update({ naam: REGELS_PREFIX + text }).eq('id', existingRegelsCat.id);
      } else {
        await supabase.from('boetecategorieen').delete().eq('id', existingRegelsCat.id);
      }
    } else if (text) {
      const maxVolgorde = categorieen.reduce((max, c) => Math.max(max, c.volgorde), 0);
      await supabase.from('boetecategorieen').insert({
        naam: REGELS_PREFIX + text,
        bedrag: 0,
        verdubbelbaar: false,
        open_bedrag: false,
        actief: false,
        volgorde: maxVolgorde + 1,
      });
    }
    setEditingRegels(false); setSaving(false);
    onChanged();
  }

  function startEdit(cat: Boetecategorie) {
    setEditingId(cat.id);
    setEditNaam(cat.naam);
    setEditBedrag((cat.bedrag / 100).toFixed(2).replace('.', ','));
    setEditDubbel(cat.verdubbelbaar);
    setEditOpenBedrag(cat.open_bedrag);
  }

  function renderCatCard(cat: Boetecategorie, isTeam: boolean) {
    const iconBg = isTeam ? 'bg-purple-100' : 'bg-blue-100';
    const iconColor = isTeam ? 'text-purple-600' : 'text-blue-600';
    const Icon = isTeam ? Shield : Tag;

    return (
      <div key={cat.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {editingId === cat.id && isHoofdbeheerder ? (
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Naam (volledige omschrijving)</label>
              <input type="text" value={editNaam} onChange={e => setEditNaam(e.target.value)} autoFocus className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Bedrag (EUR)</label>
              <input type="text" inputMode="decimal" value={editBedrag} onChange={e => setEditBedrag(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <DubbelToggle value={editDubbel} onChange={setEditDubbel} />
            <OpenBedragToggle value={editOpenBedrag} onChange={setEditOpenBedrag} />
            <div className="flex gap-2">
              <button onClick={() => handleEditSave(cat)} disabled={saving} className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                <Check className="w-4 h-4" /> Opslaan
              </button>
              <button onClick={() => setEditingId(null)} className="px-5 bg-gray-100 text-gray-500 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm">
                Annuleren
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className={`w-9 h-9 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800">{cat.naam}</p>
                {cat.verdubbelbaar && <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0"><Zap className="w-2.5 h-2.5" />x2</span>}
                {cat.open_bedrag && <span className="text-xs bg-green-100 text-green-600 font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0"><Euro className="w-2.5 h-2.5" />Open</span>}
              </div>
              <p className="text-xs text-gray-400">{cat.open_bedrag ? 'Bedrag wordt ingevuld bij activiteit' : `${formatBedrag(cat.bedrag)} per stuk`}</p>
            </div>
            {isHoofdbeheerder && (
              <>
                <button onClick={() => startEdit(cat)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(cat.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Add button / form */}
      {isHoofdbeheerder && (
        adding ? (
          <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Naam (volledige omschrijving)</label>
              <input type="text" value={newNaam} onChange={e => setNewNaam(e.target.value)} placeholder="bijv. Te laat komen" autoFocus className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Bedrag (EUR)</label>
              <input type="text" inputMode="decimal" value={newBedrag} onChange={e => setNewBedrag(e.target.value)} placeholder="2,00" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <DubbelToggle value={newDubbel} onChange={setNewDubbel} />
            <OpenBedragToggle value={newOpenBedrag} onChange={setNewOpenBedrag} />
            <button
              type="button"
              onClick={() => setNewIsTeam(!newIsTeam)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${newIsTeam ? 'border-purple-400 bg-purple-50' : 'border-gray-200'}`}
            >
              <div className="flex items-center gap-2">
                <Shield className={`w-4 h-4 ${newIsTeam ? 'text-purple-600' : 'text-gray-400'}`} />
                <div className="text-left">
                  <span className={`text-sm font-medium block ${newIsTeam ? 'text-purple-900' : 'text-gray-600'}`}>Teamboete</span>
                  <span className="text-xs text-gray-400">Geldt voor alle spelers, telt niet mee met gemiddelde</span>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${newIsTeam ? 'bg-purple-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
              </div>
            </button>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                <Check className="w-4 h-4" /> Toevoegen
              </button>
              <button type="button" onClick={() => { setAdding(false); setNewNaam(''); setNewBedrag(''); setNewDubbel(false); setNewOpenBedrag(false); setNewIsTeam(false); }} className="px-5 bg-gray-100 text-gray-500 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm">
                Annuleren
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-sm text-sm">
            <Plus className="w-4 h-4" />
            Boete toevoegen
          </button>
        )
      )}

      {/* Reguliere boetes */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Boetes</p>
        {regulier.map(cat => renderCatCard(cat, false))}
        {regulier.length === 0 && <p className="text-center text-sm text-gray-400 py-4">Nog geen boetes toegevoegd</p>}
      </div>

      {/* Teamboetes */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-purple-500" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Teamboetes</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-2xl px-4 py-2.5 text-xs text-purple-700">
          Teamboetes gelden voor alle spelers (aanwezig en afwezig) en tellen niet mee met het gemiddelde.
        </div>
        {teamboetes.map(cat => renderCatCard(cat, true))}
        {teamboetes.length === 0 && <p className="text-center text-sm text-gray-400 py-4">Nog geen teamboetes toegevoegd</p>}
      </div>

      {/* 0€ = 2€ toggle */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <button
          onClick={toggleNulIsTwee}
          disabled={!isHoofdbeheerder}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
            instellingen?.nul_euro_is_twee_euro ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
          } ${!isHoofdbeheerder ? 'cursor-default' : ''}`}
        >
          <div className="flex items-center gap-2">
            <Settings className={`w-4 h-4 ${instellingen?.nul_euro_is_twee_euro ? 'text-blue-600' : 'text-gray-400'}`} />
            <div className="text-left">
              <span className={`text-sm font-medium block ${instellingen?.nul_euro_is_twee_euro ? 'text-blue-900' : 'text-gray-600'}`}>
                0{String.fromCharCode(8364)} eind van de week = 2{String.fromCharCode(8364)}
              </span>
              <span className="text-xs text-gray-400">Blijft aan tot handmatig uitgeschakeld</span>
            </div>
          </div>
          <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
            instellingen?.nul_euro_is_twee_euro ? 'bg-blue-500 justify-end' : 'bg-gray-300 justify-start'
          }`}>
            <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
          </div>
        </button>
      </div>

      {/* Speciale regels */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">Speciale regels</h3>
          </div>
          {isHoofdbeheerder && !editingRegels && (
            <button onClick={() => { setRegelsTekst(regelsTekstValue); setEditingRegels(true); }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {editingRegels ? (
          <div className="space-y-3">
            <textarea
              value={regelsTekst}
              onChange={e => setRegelsTekst(e.target.value)}
              placeholder="bijv. Boetes moeten uiterlijk zondag 23:59 betaald worden"
              rows={5}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={saveRegelsTekst} disabled={saving} className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                <Check className="w-4 h-4" /> Opslaan
              </button>
              <button onClick={() => setEditingRegels(false)} className="px-5 bg-gray-100 text-gray-500 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm">
                Annuleren
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{regelsTekstValue || 'Nog geen regels ingesteld'}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// OVERIG TAB (Gemini key only)
// ============================================================
function OverigTab({ instellingen, isHoofdbeheerder, onChanged }: {
  instellingen: AppInstellingen | null;
  isHoofdbeheerder: boolean;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [editingGeminiKey, setEditingGeminiKey] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/setup-gemini-key');
      const data = await res.json().catch(() => ({}));
      if (!cancelled) setStoredKey(data.geminiKey ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  async function saveGeminiKey() {
    setSaving(true);
    setSaveError(null);
    const key = geminiKeyInput.trim();
    const res = await fetch('/api/setup-gemini-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiKey: key }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStoredKey(key || null);
      setEditingGeminiKey(false);
    } else {
      setSaveError(data.error ?? 'Opslaan mislukt');
    }
    setSaving(false);
  }

  const hasKey = !!storedKey;

  return (
    <div className="space-y-4">
      {/* Gemini API key */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">Gemini API-sleutel</h3>
          </div>
          {isHoofdbeheerder && !editingGeminiKey && (
            <button onClick={() => { setGeminiKeyInput(storedKey ?? ''); setEditingGeminiKey(true); }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {editingGeminiKey ? (
          <div className="space-y-3">
            <input
              type="password"
              value={geminiKeyInput}
              onChange={e => setGeminiKeyInput(e.target.value)}
              placeholder="Plak hier je Google AI Studio API-sleutel"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400">Haal een gratis sleutel op via aistudio.google.com/apikey. De sleutel wordt veilig opgeslagen en alleen gebruikt om screenshots uit te lezen.</p>
            {saveError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={saveGeminiKey}
                disabled={saving}
                className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Opslaan
              </button>
              <button onClick={() => setEditingGeminiKey(false)} className="px-5 bg-gray-100 text-gray-500 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm">
                Annuleren
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600">{hasKey ? 'API-sleutel is ingesteld' : 'Nog geen API-sleutel ingesteld — screenshot-herkenning werkt niet zonder'}</p>
        )}
      </div>
    </div>
  );
}

function DubbelToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${value ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}
    >
      <div className="flex items-center gap-2">
        <Zap className={`w-4 h-4 ${value ? 'text-orange-600' : 'text-gray-400'}`} />
        <span className={`text-sm font-medium ${value ? 'text-orange-900' : 'text-gray-600'}`}>Verdubbelbaar</span>
      </div>
      <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${value ? 'bg-orange-500 justify-end' : 'bg-gray-300 justify-start'}`}>
        <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
      </div>
    </button>
  );
}

function OpenBedragToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${value ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}
    >
      <div className="flex items-center gap-2">
        <Euro className={`w-4 h-4 ${value ? 'text-green-600' : 'text-gray-400'}`} />
        <div className="text-left">
          <span className={`text-sm font-medium block ${value ? 'text-green-900' : 'text-gray-600'}`}>Open bedrag</span>
          <span className="text-xs text-gray-400">Bedrag wordt ingevuld bij activiteit</span>
        </div>
      </div>
      <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${value ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}>
        <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
      </div>
    </button>
  );
}
