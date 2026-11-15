import {
  buildFoundationActivityReportData,
  deriveOverallInspectionStatus,
  formatDateWithWeekday,
  getReportableInspections,
} from '@/entities/project/calculations';
import { FOUNDATION_SPECS, STATUS_META } from '@/entities/project/mast2Baseline';
import type {
  FoundationInspectionItemKey,
  FoundationRecord,
  MastProjectState,
} from '@/entities/project/types';
import { uploadOrStageProjectImage } from '@/shared/lib/imageUpload';
import { useProjectStore } from '@/shared/state/projectStore';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveReportDetails,
} from '@/widgets/report/ReportLetterhead';

export function InspectionReportSheet({
  project,
  foundation,
  onSelectFoundation,
  onUploadInspectionPhoto,
}: {
  project: MastProjectState;
  foundation: FoundationRecord;
  onSelectFoundation?: (id: string) => void;
  onUploadInspectionPhoto?: (
    key: FoundationInspectionItemKey,
    photoDataUrl: string,
    photoName: string
  ) => void;
}) {
  const report = buildFoundationActivityReportData(project, null, foundation);
  const reportableInspections = getReportableInspections(report.inspections);
  const spec = FOUNDATION_SPECS[foundation.type];
  const meta = foundation.inspectionMeta ?? {};
  const reportDetails = resolveReportDetails(project, {
    reportDate: meta.inspectionDate,
    preparedBy: meta.inspectorName,
  });
  const inspectionDate = meta.inspectionDate?.trim() || project.lastUpdated;
  const inspectorName =
    meta.inspectorName?.trim() || reportDetails.preparedBy || project.preparedBy;
  const contractorRep =
    meta.contractorRep?.trim() || reportDetails.contractor || project.contractor;
  const overallStatus = deriveOverallInspectionStatus(
    meta.overallStatus,
    reportableInspections
  );

  const passedCount = reportableInspections.filter((i) => i.status === 'Passed').length;
  const photosCount = reportableInspections.filter((i) => Boolean(i.photoDataUrl)).length;

  const statusBadgeClass =
    overallStatus === 'Passed'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-400'
      : overallStatus === 'For Rectification'
        ? 'bg-rose-50 text-rose-800 border-rose-400'
        : 'bg-amber-50 text-amber-800 border-amber-400';

  return (
    <div className="bg-white text-slate-900 p-4 sm:p-6 pdf-desktop:p-6 print:p-2">
      <ReportLetterhead
        details={reportDetails}
        defaultTitle="FOUNDATION INSPECTION CHECKLIST REPORT"
        fallbackProjectName={project.projectName}
        fallbackLocation={project.location}
        fallbackContractor={contractorRep}
        fallbackDate={inspectionDate}
      />

      <div className="border-2 border-slate-900 bg-white text-xs">
        {/* Top Split Row: Left 2D Tower Layout | Right Inspection Details & Specs */}
        <div className="grid grid-cols-12 border-b-2 border-slate-900">
          {/* Left: 2D Layout Highlighting Inspected Foundation */}
          <div className="col-span-12 md:col-span-7 pdf-desktop:col-span-7 print:col-span-7 border-b-2 md:border-b-0 md:border-r-2 pdf-desktop:border-b-0 pdf-desktop:border-r-2 print:border-b-0 print:border-r-2 border-slate-900 flex flex-col p-1.5">
            <div className="text-[11px] font-bold text-slate-700 text-center py-0.5 shrink-0 uppercase tracking-wide">
              Tower Layout — Inspected Location ({foundation.id})
            </div>
            <div className="flex-1 min-h-[340px] sm:min-h-[370px] pdf-desktop:min-h-[370px] flex items-stretch justify-stretch">
              <GroundAnchorPlan2D
                foundations={project.foundations}
                selectedId={foundation.id}
                onSelect={onSelectFoundation}
                calloutTitle="INSPECTED PAD"
                compact
                hideHeader
                fillParent
              />
            </div>
          </div>

          {/* Right: Foundation & Inspection Metadata */}
          <div className="col-span-12 md:col-span-5 pdf-desktop:col-span-5 print:col-span-5 flex flex-col">
            <div className="border-b-2 border-slate-900 px-3 py-1.5 text-center font-bold text-xs sm:text-sm pdf-desktop:text-sm bg-slate-50">
              {report.foundationTitle}
            </div>

            <div className="border-b border-slate-900 p-2 space-y-0.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">Project &amp; Site</div>
              <div className="font-bold text-slate-900">{project.projectName}</div>
              <div className="text-[11px] text-slate-600">{project.location}</div>
            </div>

            <div className="grid grid-cols-12 border-b border-slate-900">
              <div className="col-span-7 border-r border-slate-900 p-2">
                <div className="text-[10px] font-bold uppercase text-slate-500">Inspection Date</div>
                <div className="font-bold text-slate-900">
                  {formatDateWithWeekday(inspectionDate)}
                </div>
              </div>
              <div className="col-span-5 p-2">
                <div className="text-[10px] font-bold uppercase text-slate-500">QA/QC Result</div>
                <span
                  className={`mt-0.5 inline-block px-2 py-0.5 rounded border text-[11px] font-bold ${statusBadgeClass}`}
                >
                  {overallStatus}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-12 border-b border-slate-900">
              <div className="col-span-6 border-r border-slate-900 p-2">
                <div className="text-[10px] font-bold uppercase text-slate-500">Size</div>
                <div className="font-semibold text-slate-900">{report.specDetails.size}</div>
                <div className="text-[10px] text-slate-600">
                  Foundation: {report.specDetails.foundationVolume} · Lean: {report.specDetails.leanConcreteVolume}
                </div>
              </div>
              <div className="col-span-6 p-2">
                <div className="text-[10px] font-bold uppercase text-slate-500">Sector &amp; Stage</div>
                <div className="font-semibold text-slate-900">
                  {foundation.sector === 'CENTER'
                    ? 'Center (0m)'
                    : `Sector ${foundation.sector} (${foundation.radiusM}m)`}
                </div>
                <div className="text-[11px] text-slate-600">
                  {STATUS_META[foundation.status].label}
                </div>
              </div>
            </div>

            <div className="border-b border-slate-900 p-2 bg-slate-50/80 space-y-0.5 text-[11px]">
              <div className="font-bold text-[10px] uppercase text-slate-500">
                Design Reference Specs
              </div>
              <div className="text-slate-800">
                • Excavation Depth: {report.specDetails.excavationDepth} · Cover: {report.specDetails.cover}
              </div>
              <div className="text-slate-800">
                • Main Rebar: {report.specDetails.mainRebar}
              </div>
              <div className="text-slate-800">
                • Chair Bar: {report.specDetails.chairBar}
              </div>
              <div className="text-slate-800">
                • {report.specDetails.towerAccessoriesLabel}: {report.specDetails.towerAccessories}
              </div>
            </div>

            <div className="p-2 space-y-1 text-[11px] flex-1 bg-white">
              <div>
                <span className="font-bold text-slate-600">Inspected By:</span>{' '}
                <span className="font-semibold text-slate-900">{inspectorName}</span>
              </div>
              <div>
                <span className="font-bold text-slate-600">Contractor Rep:</span>{' '}
                <span className="font-semibold text-slate-900">{contractorRep}</span>
              </div>
              <div>
                <span className="font-bold text-slate-600">Checklist Summary:</span>{' '}
                <span className="font-semibold text-slate-900">
                  {passedCount}/{reportableInspections.length} Passed · {photosCount}/
                  {reportableInspections.length} Photos Attached
                </span>
              </div>
              {foundation.pourDate && (
                <div>
                  <span className="font-bold text-slate-600">Pour Date:</span>{' '}
                  <span className="font-semibold text-slate-900">
                    {formatDateWithWeekday(foundation.pourDate)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Inspection Checklist Table */}
        <div className="border-b-2 border-slate-900">
          <div className="px-2.5 py-1.5 text-xs font-bold uppercase bg-slate-100 border-b border-slate-900 flex items-center justify-between">
            <span>Foundation Inspection Checklist Items</span>
            <span className="text-[11px] font-semibold text-slate-600">
              {foundation.id} · {spec.label}
            </span>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-900 bg-slate-50 text-[10px]">
                <th className="border-r border-slate-900 px-1.5 py-1.5 text-center w-8">#</th>
                <th className="border-r border-slate-900 px-2 py-1.5 text-center w-[21%]">
                  Activity Photo
                </th>
                <th className="border-r border-slate-900 px-2 py-1.5 text-left w-[17%]">
                  Inspection Item
                </th>
                <th className="border-r border-slate-900 px-2 py-1.5 text-left w-[22%]">
                  Plan Measurement
                </th>
                <th className="border-r border-slate-900 px-2 py-1.5 text-left w-[14%]">
                  Actual Measurement
                </th>
                <th className="border-r border-slate-900 px-1.5 py-1.5 text-center w-20">
                  Status
                </th>
                <th className="px-2 py-1.5 text-left">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {reportableInspections.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-xs text-slate-500 italic"
                  >
                    No inspection items included — enter a Plan Measurement in the Inspection Form to add items to this report.
                  </td>
                </tr>
              ) : (
                reportableInspections.map((item, idx) => (
                <tr key={item.key} className="break-inside-avoid">
                  <td className="border-r border-slate-900 px-2 py-2 text-center font-bold text-slate-700 align-top">
                    {idx + 1}
                  </td>
                  <td className="border-r border-slate-900 p-2 text-center align-middle h-36">
                    {item.photoDataUrl ? (
                      <div className="flex flex-col items-center justify-center">
                        <img
                          src={item.photoDataUrl}
                          alt={item.description}
                          className="max-h-32 w-full object-contain rounded"
                        />
                        {onUploadInspectionPhoto && (
                          <label className="print:hidden mt-1 inline-block text-[10px] font-medium text-sky-700 hover:underline cursor-pointer">
                            Replace Photo
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const uploaded = await uploadOrStageProjectImage({
                                  file,
                                  projectId: useProjectStore.getState().activeProjectId,
                                  category: 'inspection',
                                });
                                if (uploaded) {
                                  onUploadInspectionPhoto(
                                    item.key,
                                    uploaded.url,
                                    uploaded.name
                                  );
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                      </div>
                    ) : onUploadInspectionPhoto ? (
                      <label className="flex flex-col items-center justify-center h-28 rounded border border-dashed border-slate-300 hover:border-sky-500 hover:bg-sky-50/40 text-[11px] text-slate-500 cursor-pointer print:border-none">
                        <span>[Insert Photo]</span>
                        <span className="text-[10px] text-sky-700 mt-0.5 print:hidden">
                          Click to upload image
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const uploaded = await uploadOrStageProjectImage({
                              file,
                              projectId: useProjectStore.getState().activeProjectId,
                              category: 'inspection',
                            });
                            if (uploaded) {
                              onUploadInspectionPhoto(
                                item.key,
                                uploaded.url,
                                uploaded.name
                              );
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">[No Photo]</span>
                    )}
                  </td>
                  <td className="border-r border-slate-900 px-2 py-2 align-top text-[11px] font-semibold text-slate-900 leading-snug">
                    {item.description}
                  </td>
                  <td className="border-r border-slate-900 px-2 py-2 align-top text-[10px] text-slate-700 leading-snug">
                    {item.planMeasurement}
                  </td>
                  <td className="border-r border-slate-900 px-2 py-2 align-top text-[11px] font-semibold text-slate-900 leading-snug">
                    {item.actualMeasurement || '—'}
                  </td>
                  <td className="border-r border-slate-900 px-1.5 py-2 align-top text-center">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                        item.status === 'Passed'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : item.status === 'For Rectification'
                            ? 'bg-rose-50 border-rose-300 text-rose-800'
                            : 'bg-slate-50 border-slate-300 text-slate-700'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top text-[10px] text-slate-800 whitespace-pre-wrap leading-snug">
                    {item.remarks || '—'}
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* General Remarks & Clearance Notes */}
        <div className="border-b-2 border-slate-900 p-2.5 space-y-1">
          <div className="text-[10px] font-bold uppercase text-slate-500">
            General Inspection Observations / Pour Clearance Notes
          </div>
          <div className="text-xs text-slate-800 whitespace-pre-wrap min-h-[28px]">
            {meta.generalNotes?.trim() ||
              foundation.notes?.trim() ||
              'No additional rectification notes or remarks.'}
          </div>
        </div>

        {/* Sign-off Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 pdf-desktop:grid-cols-3 print:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x pdf-desktop:divide-y-0 pdf-desktop:divide-x print:divide-y-0 print:divide-x divide-slate-900 text-[11px]">
          <div className="p-2.5">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Inspected By (Site Engineer)
            </div>
            <div className="mt-4 pt-1 border-t border-slate-400 font-semibold text-slate-900">
              {inspectorName}
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Witnessed By (Contractor)
            </div>
            <div className="mt-4 pt-1 border-t border-slate-400 font-semibold text-slate-900">
              {contractorRep}
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] font-bold uppercase text-slate-500">Date Inspected</div>
            <div className="mt-4 pt-1 border-t border-slate-400 font-semibold text-slate-900">
              {formatDateWithWeekday(inspectionDate)}
            </div>
          </div>
        </div>
      </div>

      {/* Report Signoff & Notes Footer */}
      <ReportSignoffFooter
        details={reportDetails}
        fallbackPreparedBy={inspectorName}
        fallbackDate={inspectionDate}
      />

      {/* Footer Meta */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>
          Project: {reportDetails.projectName || project.projectName} ·{' '}
          {reportDetails.projectLocation || project.location}
        </span>
        <span>Updated: {formatDateWithWeekday(project.lastUpdated)}</span>
      </div>
    </div>
  );
}

