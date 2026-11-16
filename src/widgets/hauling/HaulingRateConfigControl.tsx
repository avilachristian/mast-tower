import { useEffect, useState } from 'react';
import { Check, Pencil, RotateCcw, Scale, X } from 'lucide-react';
import {
  HAULING_CREDIT_BLOCK_KG,
  HAULING_RATE_PER_BLOCK_PHP,
  resolveHaulingRateConfig,
} from '@/entities/project/haulingInventory';
import type { MastProjectState } from '@/entities/project/types';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore } from '@/shared/state/projectStore';

export function HaulingRateConfigControl({
  project,
}: {
  project: Pick<MastProjectState, 'haulingRateConfig'>;
}) {
  const rateConfig = resolveHaulingRateConfig(project);
  const updateHaulingRateConfig = useProjectStore((s) => s.updateHaulingRateConfig);
  const pushToast = useFeedbackStore((s) => s.pushToast);

  const [editing, setEditing] = useState(false);
  const [draftPay, setDraftPay] = useState(String(rateConfig.ratePerBlockPhp));
  const [draftKg, setDraftKg] = useState(String(rateConfig.creditBlockKg));

  useEffect(() => {
    if (editing) return;
    setDraftPay(String(rateConfig.ratePerBlockPhp));
    setDraftKg(String(rateConfig.creditBlockKg));
  }, [rateConfig.ratePerBlockPhp, rateConfig.creditBlockKg, editing]);

  const handleOpen = () => {
    setDraftPay(String(rateConfig.ratePerBlockPhp));
    setDraftKg(String(rateConfig.creditBlockKg));
    setEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedKg = Math.round(Number(draftKg) * 100) / 100;
    const parsedPay = Math.round(Number(draftPay) * 100) / 100;
    if (!Number.isFinite(parsedKg) || parsedKg < 0.01) {
      pushToast({
        tone: 'warning',
        message: 'Weight threshold (kg) must be at least 0.01 kg.',
      });
      return;
    }
    if (!Number.isFinite(parsedPay) || parsedPay < 0) {
      pushToast({
        tone: 'warning',
        message: 'Pay rate (₱) must be 0 or greater.',
      });
      return;
    }
    updateHaulingRateConfig({
      creditBlockKg: parsedKg,
      ratePerBlockPhp: parsedPay,
    });
    setEditing(false);
    pushToast({
      tone: 'success',
      message: `Hauler rate updated to ₱${parsedPay.toLocaleString()} per ${parsedKg} kg.`,
    });
  };

  const handleResetDefault = () => {
    updateHaulingRateConfig({
      creditBlockKg: HAULING_CREDIT_BLOCK_KG,
      ratePerBlockPhp: HAULING_RATE_PER_BLOCK_PHP,
    });
    setEditing(false);
    pushToast({
      tone: 'info',
      message: `Restored default hauler rate (₱${HAULING_RATE_PER_BLOCK_PHP.toLocaleString()} / ${HAULING_CREDIT_BLOCK_KG} kg).`,
    });
  };

  if (!editing) {
    return (
      <div className="inline-flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-200 bg-amber-50 text-[11px] font-bold text-amber-900 tabular-nums">
          <Scale className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>
            Rate: ₱{rateConfig.ratePerBlockPhp.toLocaleString()} /{' '}
            {rateConfig.creditBlockKg} kg
          </span>
        </span>
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
        >
          <Pencil className="w-3 h-3 text-slate-500" />
          <span>Edit Rate</span>
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2.5 text-xs"
    >
      <div>
        <label className="block text-[10px] font-bold uppercase text-amber-900 mb-0.5">
          Pay per Block (₱)
        </label>
        <input
          type="number"
          min={0}
          step="any"
          aria-label="Hauler pay per weight block (PHP)"
          value={draftPay}
          onChange={(e) => setDraftPay(e.target.value)}
          className="w-24 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-bold text-slate-900 focus:border-amber-600 focus:outline-none tabular-nums"
          required
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase text-amber-900 mb-0.5">
          Block Weight (kg)
        </label>
        <input
          type="number"
          min={0.01}
          step="any"
          aria-label="Hauler block weight threshold (kg)"
          value={draftKg}
          onChange={(e) => setDraftKg(e.target.value)}
          className="w-24 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-bold text-slate-900 focus:border-amber-600 focus:outline-none tabular-nums"
          required
        />
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer"
        >
          <Check className="w-3 h-3" />
          <span>Save</span>
        </button>
        {(rateConfig.creditBlockKg !== HAULING_CREDIT_BLOCK_KG ||
          rateConfig.ratePerBlockPhp !== HAULING_RATE_PER_BLOCK_PHP) && (
          <button
            type="button"
            onClick={handleResetDefault}
            title={`Reset to ₱${HAULING_RATE_PER_BLOCK_PHP.toLocaleString()} / ${HAULING_CREDIT_BLOCK_KG} kg`}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-amber-300 bg-white hover:bg-amber-100 text-[11px] font-semibold text-amber-900 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancel rate edit"
          className="inline-flex items-center justify-center p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </form>
  );
}
