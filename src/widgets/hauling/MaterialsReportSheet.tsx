import { useMemo } from 'react';
import { computeCentralMaterialStatuses } from '@/entities/project/haulingInventory';
import type { MastProjectState } from '@/entities/project/types';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveReportDetails,
} from '@/widgets/report/ReportLetterhead';

export type MaterialsReportPhaseScope = 'active' | 'all';

function formatNum(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatCategoryLabel(category: 'foundation' | 'vertical_mast' | 'shared'): string {
  if (category === 'foundation') return 'Foundation';
  if (category === 'vertical_mast') return 'Vertical Mast';
  return 'Shared';
}

export function MaterialsReportSheet({
  project,
  phaseScope = 'active',
}: {
  project: MastProjectState;
  phaseScope?: MaterialsReportPhaseScope;
}) {
  const activePhase = project.projectType ?? 'foundation';
  const allRows = useMemo(() => computeCentralMaterialStatuses(project), [project]);
  const filteredRows = useMemo(() => {
    if (phaseScope === 'all') return allRows;
    return allRows.filter(
      (row) => row.item.category === activePhase || row.item.category === 'shared'
    );
  }, [allRows, phaseScope, activePhase]);

  const metrics = useMemo(() => {
    let totalHauledKg = 0;
    let stockedAtYardCount = 0;
    let yardDeficitCount = 0;
    let stillNeededCount = 0;
    let targetsMetCount = 0;

    for (const row of filteredRows) {
      totalHauledKg += row.hauledKg;
      if (row.stockYardRemainingQty > 0) stockedAtYardCount += 1;
      if (row.stockYardRemainingQty < 0) yardDeficitCount += 1;
      if (row.stillNeededOnSiteQty > 0) stillNeededCount += 1;
      else if (row.item.targetQty > 0) targetsMetCount += 1;
    }

    return {
      totalTracked: filteredRows.length,
      totalHauledKg: Math.round(totalHauledKg * 100) / 100,
      stockedAtYardCount,
      yardDeficitCount,
      stillNeededCount,
      targetsMetCount,
    };
  }, [filteredRows]);

  const reportDetails = useMemo(() => resolveReportDetails(project), [project]);
  const scopeLabel =
    phaseScope === 'all'
      ? 'All Project Materials'
      : activePhase === 'vertical_mast'
        ? 'Vertical Mast Phase'
        : 'Foundation Phase';

  return (
    <div className="bg-white text-slate-900 p-4 sm:p-6 pdf-desktop:p-6 print:p-2">
      <ReportLetterhead
        details={reportDetails}
        defaultTitle="MATERIALS INVENTORY REPORT"
        subtitle={`Stock Yard & On-Site Balance · ${scopeLabel} · ${metrics.totalTracked} Tracked Items · ${formatNum(metrics.totalHauledKg)} kg Hauled`}
        fallbackProjectName={project.projectName}
        fallbackLocation={project.location}
        fallbackContractor={project.contractor}
        fallbackDate={project.lastUpdated}
      />

      <div className="border-2 border-slate-900 bg-white text-xs">
        {/* 4-Column Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 pdf-desktop:grid-cols-4 print:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x pdf-desktop:divide-y-0 pdf-desktop:divide-x print:divide-y-0 print:divide-x divide-slate-900 border-b-2 border-slate-900">
          <div className="p-2.5">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              Tracked Materials
            </div>
            <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
              {metrics.totalTracked} {metrics.totalTracked === 1 ? 'item' : 'items'}
            </div>
            <div className="text-[10px] text-slate-500">{scopeLabel}</div>
          </div>

          <div className="p-2.5">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              Total Hauled Weight
            </div>
            <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
              {formatNum(metrics.totalHauledKg)} kg
            </div>
            <div className="text-[10px] text-slate-500">
              Horse hauling transfers to site
            </div>
          </div>

          <div className="p-2.5">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              Stock Yard Status
            </div>
            <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
              {metrics.stockedAtYardCount} stocked
            </div>
            <div
              className={`text-[10px] ${
                metrics.yardDeficitCount > 0 ? 'text-amber-700 font-semibold' : 'text-slate-500'
              }`}
            >
              {metrics.yardDeficitCount > 0
                ? `${metrics.yardDeficitCount} over-hauled vs yard`
                : 'Yard balances reconciled'}
            </div>
          </div>

          <div className="p-2.5">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              On-Site Delivery Status
            </div>
            <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
              {metrics.stillNeededCount} needed
            </div>
            <div className="text-[10px] text-emerald-700 font-semibold">
              {metrics.targetsMetCount} site target{metrics.targetsMetCount === 1 ? '' : 's'} met
            </div>
          </div>
        </div>

        {/* Combined Stock Yard & On-Site Balance Table */}
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse text-left text-[10.5px]">
            <thead>
              <tr className="border-b border-slate-900 bg-slate-100 text-[9.5px] font-bold uppercase tracking-wider text-slate-700">
                <th
                  rowSpan={2}
                  className="px-2.5 py-1.5 border-r border-slate-900 align-bottom"
                >
                  Material &amp; Unit
                </th>
                <th
                  colSpan={3}
                  className="px-2 py-1 border-r border-slate-900 text-center bg-slate-100"
                >
                  Stock Yard
                </th>
                <th
                  colSpan={4}
                  className="px-2 py-1 border-r border-slate-900 text-center bg-sky-50/70 text-sky-900"
                >
                  On-Site Flow &amp; Balance
                </th>
                <th
                  colSpan={2}
                  className="px-2 py-1 text-center bg-slate-100"
                >
                  Target &amp; Status
                </th>
              </tr>
              <tr className="border-b-2 border-slate-900 bg-slate-50 text-[9.5px] font-bold uppercase text-slate-600">
                <th className="px-2 py-1.5 border-r border-slate-300 text-right whitespace-nowrap">
                  Purchased
                </th>
                <th className="px-2 py-1.5 border-r border-slate-300 text-right whitespace-nowrap">
                  Hauled
                </th>
                <th className="px-2 py-1.5 border-r border-slate-900 text-right whitespace-nowrap">
                  Remaining
                </th>
                <th className="px-2 py-1.5 border-r border-slate-300 text-right whitespace-nowrap">
                  Opening
                </th>
                <th className="px-2 py-1.5 border-r border-slate-300 text-right whitespace-nowrap">
                  Delivered
                </th>
                <th className="px-2 py-1.5 border-r border-slate-300 text-right whitespace-nowrap">
                  Used
                </th>
                <th className="px-2 py-1.5 border-r border-slate-900 text-right whitespace-nowrap">
                  On Site
                </th>
                <th className="px-2 py-1.5 border-r border-slate-300 text-right whitespace-nowrap">
                  Target
                </th>
                <th className="px-2 py-1.5 text-right whitespace-nowrap">
                  Still Needed
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    No materials recorded for {scopeLabel.toLowerCase()}. Add material items in Hauling &amp; Inventory or switch to All Materials.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const { item } = row;
                  const yardDeficit = row.stockYardRemainingQty < 0;
                  const siteComplete =
                    row.stillNeededOnSiteQty <= 0 && item.targetQty > 0;

                  return (
                    <tr
                      key={item.id}
                      className="border-b last:border-b-0 border-slate-300 odd:bg-white even:bg-slate-50/40 break-inside-avoid"
                    >
                      <td className="px-2.5 py-2 border-r border-slate-900 align-top">
                        <div className="font-bold text-slate-900 leading-snug">
                          {item.name}
                        </div>
                        <div className="text-[9.5px] text-slate-500 mt-0.5">
                          <span>{item.unit}</span>
                          {phaseScope === 'all' && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>{formatCategoryLabel(item.category)}</span>
                            </>
                          )}
                          {item.remarks?.trim() && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>{item.remarks.trim()}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Stock Yard: Purchased */}
                      <td className="px-2 py-2 border-r border-slate-200 text-right tabular-nums align-top">
                        <div className="font-semibold text-slate-800">
                          {formatNum(row.stockYardTotalQty)}
                        </div>
                        {row.stockYardTotalCuM !== null && (
                          <div className="text-[9px] text-slate-400">
                            {formatNum(row.stockYardTotalCuM)} cu.m
                          </div>
                        )}
                      </td>

                      {/* Stock Yard: Hauled */}
                      <td className="px-2 py-2 border-r border-slate-200 text-right tabular-nums align-top">
                        <div className="text-slate-700">{formatNum(row.hauledQty)}</div>
                        {row.hauledKg > 0 && (
                          <div className="text-[9px] text-slate-400">
                            {formatNum(row.hauledKg)} kg
                          </div>
                        )}
                      </td>

                      {/* Stock Yard: Remaining */}
                      <td className="px-2 py-2 border-r border-slate-900 text-right tabular-nums align-top">
                        <div
                          className={`font-bold ${
                            yardDeficit ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {formatNum(row.stockYardRemainingQty)}
                        </div>
                        {row.stockYardRemainingCuM !== null && (
                          <div className="text-[9px] text-slate-400">
                            {formatNum(row.stockYardRemainingCuM)} cu.m
                          </div>
                        )}
                      </td>

                      {/* On-Site: Opening */}
                      <td className="px-2 py-2 border-r border-slate-200 text-right tabular-nums text-slate-700 align-top">
                        {formatNum(row.onSiteOpeningQty)}
                      </td>

                      {/* On-Site: Delivered */}
                      <td className="px-2 py-2 border-r border-slate-200 text-right tabular-nums font-semibold text-slate-800 align-top">
                        {formatNum(row.totalDeliveredToSiteQty)}
                      </td>

                      {/* On-Site: Used */}
                      <td className="px-2 py-2 border-r border-slate-200 text-right tabular-nums text-slate-700 align-top">
                        {formatNum(row.usedOnSiteQty)}
                      </td>

                      {/* On-Site: Remaining */}
                      <td className="px-2 py-2 border-r border-slate-900 text-right tabular-nums font-bold text-slate-900 align-top bg-sky-50/30">
                        {formatNum(row.onSiteRemainingQty)}
                      </td>

                      {/* Target */}
                      <td className="px-2 py-2 border-r border-slate-200 text-right tabular-nums text-slate-700 align-top">
                        {formatNum(item.targetQty)}
                      </td>

                      {/* Still Needed / Status */}
                      <td className="px-2 py-2 text-right tabular-nums align-top">
                        {row.stillNeededOnSiteQty > 0 ? (
                          <div>
                            <div className="font-bold text-amber-700">
                              Need {formatNum(row.stillNeededOnSiteQty)}
                            </div>
                            {row.stillNeededCuM !== null && (
                              <div className="text-[9px] text-amber-600">
                                {formatNum(row.stillNeededCuM)} cu.m
                              </div>
                            )}
                          </div>
                        ) : siteComplete ? (
                          <span className="font-bold text-emerald-700">Complete</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-900 bg-slate-50 px-3 py-1.5 text-[9.5px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>
            Yard Remaining = Purchased − Hauled Out · Total Delivered = On-Site Opening + Hauled Out · On-Site Balance = Total Delivered − Daily Log Used
          </span>
          <span>Sand &amp; Gravel conversion: 1 cu.m = 36 bags</span>
        </div>
      </div>

      <ReportSignoffFooter
        details={reportDetails}
        fallbackDate={project.lastUpdated}
      />
    </div>
  );
}
