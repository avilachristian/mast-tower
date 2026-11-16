import { useMemo, useState } from 'react';
import {
  Banknote,
  HardHat,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  computeHaulerCreditLedgers,
  resolveHaulingRateConfig,
} from '@/entities/project/haulingInventory';
import { resolveManpowerRoster } from '@/entities/project/manpowerPayroll';
import type { ManpowerCategory, ManpowerMember } from '@/entities/project/types';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';
import { CivilWorksPayrollPanel } from './CivilWorksPayrollPanel';
import { HaulerPayrollPanel } from './HaulerPayrollPanel';
import { ManpowerMemberModal } from './ManpowerMemberModal';
import { PayrollPrintModal, type PayrollSheetData } from './PayrollPrintModal';

type RosterFilter = 'all' | 'civil_works' | 'hauler';

export function ManpowerView() {
  const project = useProjectStore((s) => s.project);
  const addManpowerMember = useProjectStore((s) => s.addManpowerMember);
  const updateManpowerMember = useProjectStore((s) => s.updateManpowerMember);
  const deleteManpowerMember = useProjectStore((s) => s.deleteManpowerMember);

  const manpowerSubTab = useUiStore((s) => s.manpowerSubTab);
  const setManpowerSubTab = useUiStore((s) => s.setManpowerSubTab);
  const manpowerPaymentMode = useUiStore((s) => s.manpowerPaymentMode);
  const setManpowerPaymentMode = useUiStore((s) => s.setManpowerPaymentMode);
  const requestConfirm = useFeedbackStore((s) => s.requestConfirm);

  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ManpowerMember | null>(null);
  const [defaultModalCategory, setDefaultModalCategory] =
    useState<ManpowerCategory>('civil_works');
  const [printSheet, setPrintSheet] = useState<PayrollSheetData | null>(null);

  const roster = useMemo(() => resolveManpowerRoster(project), [project]);
  const civilMembers = useMemo(
    () => roster.filter((m) => m.category === 'civil_works'),
    [roster]
  );
  const haulerMembers = useMemo(
    () => roster.filter((m) => m.category === 'hauler'),
    [roster]
  );

  const rateConfig = useMemo(
    () => resolveHaulingRateConfig(project),
    [project]
  );

  const haulerStats = useMemo(
    () =>
      computeHaulerCreditLedgers(
        project.haulingLogs,
        project.haulerPayouts ?? [],
        undefined,
        rateConfig
      ),
    [project.haulingLogs, project.haulerPayouts, rateConfig]
  );

  const haulerLedgerByName = useMemo(() => {
    const map = new Map<string, (typeof haulerStats.ledgers)[number]>();
    for (const row of haulerStats.ledgers) {
      map.set(row.haulerName.trim().toLowerCase(), row);
    }
    return map;
  }, [haulerStats.ledgers]);

  const filteredRoster = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return roster
      .filter((m) => {
        if (rosterFilter !== 'all' && m.category !== rosterFilter) return false;
        if (!q) return true;
        return (
          m.name.toLowerCase().includes(q) ||
          m.position.toLowerCase().includes(q) ||
          (m.notes ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.category !== b.category) {
          return a.category === 'civil_works' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }, [roster, rosterFilter, searchQuery]);

  const civilHistoryTotalPending = useMemo(
    () =>
      (project.civilPayrollHistory ?? [])
        .filter((r) => r.status === 'generated')
        .reduce((s, r) => s + r.totalAmountPhp, 0),
    [project.civilPayrollHistory]
  );

  const openAddMember = (cat: ManpowerCategory = 'civil_works') => {
    setEditingMember(null);
    setDefaultModalCategory(cat);
    setMemberModalOpen(true);
  };

  const openEditMember = (member: ManpowerMember) => {
    setEditingMember(member);
    setDefaultModalCategory(member.category);
    setMemberModalOpen(true);
  };

  const handleSaveMember = (
    data: Omit<ManpowerMember, 'id'>,
    editingId?: string
  ) => {
    if (editingId) {
      updateManpowerMember(editingId, data);
    } else {
      addManpowerMember(data);
    }
  };

  const handleDeleteMember = async (member: ManpowerMember) => {
    const ok = await requestConfirm({
      tone: 'danger',
      title: 'Remove from Roster?',
      message: `Remove "${member.name}" (${member.position}) from the Manpower Roster?`,
      detail:
        member.category === 'hauler'
          ? 'Removing this individual hauler removes them from active hauler chips while preserving historical trip logs.'
          : 'This will remove the worker from future attendance checklists and saved daily attendance entries.',
      confirmLabel: 'Remove',
    });
    if (ok) {
      deleteManpowerMember(member.id);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-600" />
            <span>Manpower Roster &amp; Payroll</span>
          </h2>
          <p className="text-xs text-slate-500">
            Manage Civil Works crew and Individual Haulers, tick daily attendance, and generate printable Daily / Weekly / Monthly / Overall payrolls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openAddMember('civil_works')}
            className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Worker</span>
          </button>
          <button
            type="button"
            onClick={() => openAddMember('hauler')}
            className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Individual Hauler</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Civil Works Crew
          </div>
          <div className="text-lg font-extrabold text-slate-900 mt-0.5">
            {civilMembers.filter((m) => m.active).length} active
          </div>
          <div className="text-[11px] text-slate-500">
            {civilMembers.length} total in roster
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Individual Haulers
          </div>
          <div className="text-lg font-extrabold text-amber-900 mt-0.5">
            {haulerMembers.filter((m) => m.active).length} active
          </div>
          <div className="text-[11px] text-amber-700">
            Paid ₱{rateConfig.ratePerBlockPhp.toLocaleString()} per {rateConfig.creditBlockKg} kg block
          </div>
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
            Civil Payroll Pending
          </div>
          <div className="text-lg font-extrabold text-sky-900 mt-0.5">
            ₱{civilHistoryTotalPending.toLocaleString()}
          </div>
          <div className="text-[11px] text-sky-700">
            {(project.civilPayrollHistory ?? []).length} saved payroll sheet
            {(project.civilPayrollHistory ?? []).length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Hauler Balance Due
          </div>
          <div className="text-lg font-extrabold text-emerald-900 mt-0.5">
            ₱{haulerStats.totalBalanceDuePhp.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-700">
            {haulerStats.totalCredits} credits earned · ₱{haulerStats.totalPaidPhp.toLocaleString()} paid
          </div>
        </div>
      </div>

      {/* 2 Distinct Sub-Tabs: Roster | Payment */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-white border border-slate-200 rounded-xl p-2 shadow-2xs">
        <div className="grid grid-cols-2 sm:inline-flex rounded-lg bg-slate-100 p-1 gap-1">
          <button
            type="button"
            onClick={() => setManpowerSubTab('roster')}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
              manpowerSubTab === 'roster'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Roster ({roster.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setManpowerSubTab('payment')}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
              manpowerSubTab === 'payment'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Banknote className="w-3.5 h-3.5" />
            <span>Payment &amp; Payroll</span>
          </button>
        </div>

        {manpowerSubTab === 'roster' ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'civil_works', label: 'Civil Works' },
                  { id: 'hauler', label: 'Individual Haulers' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRosterFilter(opt.id)}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    rosterFilter === opt.id
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or position..."
                className="w-full min-h-9 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
            <button
              type="button"
              onClick={() => setManpowerPaymentMode('civil_works')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                manpowerPaymentMode === 'civil_works'
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HardHat className="w-3.5 h-3.5" />
              <span>Civil Works Payroll</span>
            </button>
            <button
              type="button"
              onClick={() => setManpowerPaymentMode('hauler')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                manpowerPaymentMode === 'hauler'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Hauler Payroll</span>
            </button>
          </div>
        )}
      </div>

      {/* ================= SUB-TAB 1: MANPOWER ROSTER ================= */}
      {manpowerSubTab === 'roster' && (
        <div className="space-y-3">
          {filteredRoster.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-700">
                No workers or haulers match this filter
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Add Civil Works workers with their Position &amp; Daily Rate, or Individual Haulers paid per {rateConfig.creditBlockKg} kg block.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openAddMember('civil_works')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Civil Worker
                </button>
                <button
                  type="button"
                  onClick={() => openAddMember('hauler')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Individual Hauler
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile Roster Cards */}
              <div className="md:hidden space-y-2.5">
                {filteredRoster.map((member) => {
                  const ledger =
                    member.category === 'hauler'
                      ? haulerLedgerByName.get(member.name.trim().toLowerCase())
                      : undefined;
                  return (
                    <div
                      key={member.id}
                      className={`rounded-xl border bg-white p-3.5 space-y-2 shadow-2xs ${
                        member.active
                          ? 'border-slate-200'
                          : 'border-slate-200 opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">
                              {member.name}
                            </span>
                            {!member.active && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                member.category === 'hauler'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-sky-100 text-sky-800'
                              }`}
                            >
                              {member.position}
                            </span>
                            <span className="text-xs font-bold text-slate-700">
                              {member.category === 'hauler'
                                ? `₱${rateConfig.ratePerBlockPhp.toLocaleString()} / ${rateConfig.creditBlockKg} kg`
                                : `₱${member.dailyRatePhp.toLocaleString()} / day`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditMember(member)}
                            aria-label={`Edit ${member.name}`}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteMember(member)}
                            aria-label={`Delete ${member.name}`}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {ledger && (
                        <div className="text-[11px] text-slate-600 bg-amber-50/60 border border-amber-200 rounded-lg px-2.5 py-1.5">
                          {ledger.tripsCompleted} trips · {ledger.totalHauledKg.toLocaleString()} kg · Balance Due: <strong>₱{ledger.balanceDuePhp.toLocaleString()}</strong>
                        </div>
                      )}
                      {member.notes && (
                        <div className="text-[11px] text-slate-500">
                          {member.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Roster Table */}
              <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-2xs overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-bold">Name</th>
                      <th className="px-3 py-2.5 font-bold">Type</th>
                      <th className="px-3 py-2.5 font-bold">Position</th>
                      <th className="px-3 py-2.5 font-bold text-right">Rate / Pay Style</th>
                      <th className="px-3 py-2.5 font-bold">Status</th>
                      <th className="px-3 py-2.5 font-bold">Notes / Summary</th>
                      <th className="px-3 py-2.5 text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRoster.map((member) => {
                      const ledger =
                        member.category === 'hauler'
                          ? haulerLedgerByName.get(member.name.trim().toLowerCase())
                          : undefined;
                      return (
                        <tr
                          key={member.id}
                          className={`hover:bg-slate-50/70 ${
                            !member.active ? 'opacity-65' : ''
                          }`}
                        >
                          <td className="px-3 py-2.5 font-bold text-slate-900">
                            {member.name}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                member.category === 'hauler'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-sky-100 text-sky-800'
                              }`}
                            >
                              {member.category === 'hauler'
                                ? 'Individual Hauler'
                                : 'Civil Works'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-slate-700">
                            {member.position}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                            {member.category === 'hauler'
                              ? `₱${rateConfig.ratePerBlockPhp.toLocaleString()} / ${rateConfig.creditBlockKg} kg`
                              : `₱${member.dailyRatePhp.toLocaleString()} / day`}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                member.active
                                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {member.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[11px] text-slate-500">
                            {ledger
                              ? `${ledger.tripsCompleted} trips · ${ledger.totalHauledKg.toLocaleString()} kg · Due ₱${ledger.balanceDuePhp.toLocaleString()}`
                              : member.notes || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditMember(member)}
                                aria-label={`Edit ${member.name}`}
                                className="p-1.5 rounded text-slate-500 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteMember(member)}
                                aria-label={`Delete ${member.name}`}
                                className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ================= SUB-TAB 2: PAYMENT & PAYROLL ================= */}
      {manpowerSubTab === 'payment' &&
        (manpowerPaymentMode === 'civil_works' ? (
          <CivilWorksPayrollPanel
            project={project}
            civilMembers={civilMembers}
            onAddWorker={() => openAddMember('civil_works')}
            onPrintSheet={setPrintSheet}
          />
        ) : (
          <HaulerPayrollPanel
            project={project}
            roster={roster}
            onPrintSheet={setPrintSheet}
          />
        ))}

      <ManpowerMemberModal
        open={memberModalOpen}
        editingMember={editingMember}
        defaultCategory={defaultModalCategory}
        onClose={() => setMemberModalOpen(false)}
        onSave={handleSaveMember}
      />

      {printSheet && (
        <PayrollPrintModal
          project={project}
          data={printSheet}
          onClose={() => setPrintSheet(null)}
        />
      )}
    </div>
  );
}
