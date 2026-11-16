import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, UserPlus, X } from 'lucide-react';
import { resolveHaulingRateConfig } from '@/entities/project/haulingInventory';
import {
  CIVIL_WORK_POSITIONS,
  MANPOWER_POSITIONS,
} from '@/entities/project/manpowerPayroll';
import type {
  ManpowerCategory,
  ManpowerMember,
  WorkerRole,
} from '@/entities/project/types';
import { useProjectStore } from '@/shared/state/projectStore';

interface ManpowerMemberModalProps {
  open: boolean;
  editingMember: ManpowerMember | null;
  defaultCategory?: ManpowerCategory;
  onClose: () => void;
  onSave: (data: Omit<ManpowerMember, 'id'>, editingId?: string) => void;
}

export function ManpowerMemberModal({
  open,
  editingMember,
  defaultCategory = 'civil_works',
  onClose,
  onSave,
}: ManpowerMemberModalProps) {
  const creditBlockKg = useProjectStore(
    (s) => s.project.haulingRateConfig?.creditBlockKg
  );
  const ratePerBlockPhp = useProjectStore(
    (s) => s.project.haulingRateConfig?.ratePerBlockPhp
  );
  const rateConfig = resolveHaulingRateConfig({
    creditBlockKg,
    ratePerBlockPhp,
  });
  const [category, setCategory] = useState<ManpowerCategory>(defaultCategory);
  const [name, setName] = useState('');
  const [position, setPosition] = useState<WorkerRole>('Laborer');
  const [dailyRate, setDailyRate] = useState('500');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editingMember) {
      setCategory(editingMember.category);
      setName(editingMember.name);
      setPosition(editingMember.position);
      setDailyRate(
        editingMember.category === 'civil_works'
          ? String(editingMember.dailyRatePhp ?? 0)
          : '0'
      );
      setActive(editingMember.active);
      setNotes(editingMember.notes ?? '');
    } else {
      setCategory(defaultCategory);
      setName('');
      setPosition(defaultCategory === 'hauler' ? 'Horse Hauler' : 'Laborer');
      setDailyRate(defaultCategory === 'hauler' ? '0' : '500');
      setActive(true);
      setNotes('');
    }
  }, [open, editingMember, defaultCategory]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const handleCategorySwitch = (nextCat: ManpowerCategory) => {
    setCategory(nextCat);
    if (nextCat === 'hauler') {
      setPosition('Horse Hauler');
      setDailyRate('0');
    } else {
      if (position === 'Horse Hauler') {
        setPosition(CIVIL_WORK_POSITIONS[CIVIL_WORK_POSITIONS.length - 2] ?? 'Laborer');
      }
      if (!Number(dailyRate)) {
        setDailyRate('500');
      }
    }
  };

  const handlePositionChange = (nextPos: WorkerRole) => {
    setPosition(nextPos);
    if (nextPos === 'Horse Hauler') {
      setCategory('hauler');
      setDailyRate('0');
    } else if (category === 'hauler') {
      setCategory('civil_works');
      if (!Number(dailyRate)) {
        setDailyRate('500');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const finalCat: ManpowerCategory =
      position === 'Horse Hauler' ? 'hauler' : category;
    onSave(
      {
        name: trimmedName,
        category: finalCat,
        position: finalCat === 'hauler' ? 'Horse Hauler' : position,
        dailyRatePhp:
          finalCat === 'hauler' ? 0 : Math.max(0, Number(dailyRate) || 0),
        active,
        notes: notes.trim() || undefined,
      },
      editingMember?.id
    );
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 print:hidden bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manpower-member-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-100 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3
                id="manpower-member-modal-title"
                className="text-sm font-bold text-slate-900"
              >
                {editingMember ? 'Edit Manpower Member' : 'Add Worker or Hauler'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {category === 'hauler'
                  ? `Individual hauler paid per ${rateConfig.creditBlockKg} kg block`
                  : 'Civil works crew paid by daily rate'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close member modal"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
          {/* Category Toggle */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
              Manpower Type
            </label>
            <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => handleCategorySwitch('civil_works')}
                className={`min-h-9 rounded-md text-xs font-bold transition cursor-pointer ${
                  category === 'civil_works'
                    ? 'bg-white text-sky-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Civil Works Worker
              </button>
              <button
                type="button"
                onClick={() => handleCategorySwitch('hauler')}
                className={`min-h-9 rounded-md text-xs font-bold transition cursor-pointer ${
                  category === 'hauler'
                    ? 'bg-white text-amber-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Individual Hauler
              </button>
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                category === 'hauler'
                  ? 'e.g. Juan Dela Cruz'
                  : 'e.g. Roberto Santos'
              }
              required
              autoFocus
              className="w-full min-h-10 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Position Dropdown (identical options to Daily Log) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Position
              </label>
              <select
                value={position}
                onChange={(e) => handlePositionChange(e.target.value as WorkerRole)}
                className="w-full min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                {MANPOWER_POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            {category === 'civil_works' ? (
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Daily Rate (₱ / Day)
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
                  required
                  className="w-full min-h-10 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Pay Structure
                </label>
                <div className="min-h-10 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    ₱{rateConfig.ratePerBlockPhp.toLocaleString()} per{' '}
                    {rateConfig.creditBlockKg} kg
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
              Notes / Remarks (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contact no., assignment, or notes..."
              className="w-full min-h-9 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded accent-sky-600"
            />
            <span className="text-xs font-semibold text-slate-800">
              Active on site (shown in Attendance &amp; Hauling chips)
            </span>
          </label>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-9 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="min-h-9 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer shadow-xs"
            >
              {editingMember ? 'Save Changes' : 'Add to Roster'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
