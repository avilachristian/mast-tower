import { FOUNDATION_SPECS, STATUS_META } from '@/entities/project/mast2Baseline';
import type { FoundationRecord, FoundationStatus } from '@/entities/project/types';

export function computeCalloutBoxWidth(labelText: string, isSingle: boolean): number {
  if (!isSingle) return 74;
  return Math.max(180, Math.ceil(labelText.length * 6.5) + 28);
}

export function getSelectionLeaderLayout(
  foundation: FoundationRecord,
  fx: number,
  fy: number,
  boxW: number,
  isSingle: boolean
): { elbowX: number; elbowY: number; boxX: number; align: 'left' | 'right' | 'center' } {
  const minX = 38;
  const maxX = 722;

  if (foundation.sector === 'CENTER') {
    return {
      elbowX: fx,
      elbowY: isSingle ? 168 : 252,
      boxX: Math.max(minX, Math.min(maxX - boxW, fx - boxW / 2)),
      align: 'center',
    };
  }
  if (foundation.sector === 'III') {
    const rightEdgeX = isSingle ? Math.max(204, minX + boxW) : 178;
    const elbowX = foundation.radiusM <= 20 ? 352 : 348;
    const elbowY =
      foundation.radiusM <= 20 ? (isSingle ? 366 : 374) : fy - 24;
    return {
      elbowX,
      elbowY,
      boxX: rightEdgeX - boxW,
      align: 'left',
    };
  }
  if (foundation.sector === 'I') {
    if (foundation.radiusM >= 65) {
      return isSingle
        ? { elbowX: 650, elbowY: 218, boxX: 716 - boxW, align: 'left' }
        : { elbowX: 636, elbowY: 216, boxX: 636, align: 'right' };
    }
    if (foundation.radiusM >= 45) {
      return isSingle
        ? { elbowX: 595, elbowY: 266, boxX: maxX - boxW, align: 'left' }
        : { elbowX: 590, elbowY: 256, boxX: 590, align: 'right' };
    }
    if (foundation.radiusM >= 30) {
      const boxX = Math.min(525, maxX - boxW);
      return isSingle
        ? { elbowX: boxX, elbowY: 304, boxX, align: 'right' }
        : { elbowX: 538, elbowY: 298, boxX: 538, align: 'right' };
    }
    const boxX = Math.min(482, maxX - boxW);
    return isSingle
      ? { elbowX: boxX, elbowY: 348, boxX, align: 'right' }
      : { elbowX: 482, elbowY: 342, boxX: 482, align: 'right' };
  }
  // Sector II (150° mirrored staircase)
  if (foundation.radiusM >= 65) {
    return isSingle
      ? { elbowX: 110, elbowY: 218, boxX: 44, align: 'right' }
      : { elbowX: 124, elbowY: 216, boxX: 124 - boxW, align: 'left' };
  }
  if (foundation.radiusM >= 45) {
    return isSingle
      ? { elbowX: 165, elbowY: 266, boxX: minX, align: 'right' }
      : { elbowX: 170, elbowY: 256, boxX: 170 - boxW, align: 'left' };
  }
  if (foundation.radiusM >= 30) {
    const rightEdge = Math.max(228, minX + boxW);
    return isSingle
      ? { elbowX: rightEdge, elbowY: 304, boxX: rightEdge - boxW, align: 'left' }
      : { elbowX: 222, elbowY: 298, boxX: 222 - boxW, align: 'left' };
  }
  const rightEdge = Math.max(266, minX + boxW);
  return isSingle
    ? { elbowX: rightEdge, elbowY: 348, boxX: rightEdge - boxW, align: 'left' }
    : { elbowX: 266, elbowY: 342, boxX: 266 - boxW, align: 'left' };
}

export function GroundAnchorPlan2D({
  foundations,
  selectedId,
  highlightedIds,
  calloutTitle = 'CURRENT FOUNDATION',
  title = '2D Foundation & Anchor Layout Plan',
  subtitle = 'Select any foundation pad to view or update its civil works status',
  showNodeLabels = false,
  onSelect,
  compact = false,
  fillParent = false,
  hideHeader = false,
}: {
  foundations: FoundationRecord[];
  selectedId?: string;
  highlightedIds?: string[];
  calloutTitle?: string;
  title?: string;
  subtitle?: string;
  showNodeLabels?: boolean;
  onSelect?: (id: string) => void;
  compact?: boolean;
  fillParent?: boolean;
  hideHeader?: boolean;
}) {
  const highlightedSet = new Set(highlightedIds ?? []);
  // SVG coordinate space: 1 meter = 4.2 px; origin at (380, 315)
  const cx = 380;
  const cy = 315;
  const scale = 4.2;

  const toSvg = (xM: number, zM: number): [number, number] => [cx + xM * scale, cy + zM * scale];

  const statusCounts = foundations.reduce<Record<FoundationStatus, number>>(
    (acc, f) => {
      acc[f.status] = (acc[f.status] ?? 0) + 1;
      return acc;
    },
    {
      not_started: 0,
      excavated: 0,
      lean_concrete: 0,
      rebar_and_anchor: 0,
      formwork: 0,
      concreted: 0,
      curing: 0,
      completed: 0,
    }
  );

  // Dimension ticks along Sector III (straight down at x = cx + 52)
  const dimX = cx + 52;
  const dimRadii = [0, 18, 36, 54, 72];

  return (
    <div
      className={
        fillParent
          ? 'w-full h-full flex flex-col bg-white overflow-hidden'
          : 'rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden'
      }
    >
      {!hideHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 shrink-0">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {title}
          </h2>
          <p className="text-xs text-slate-500">
            {subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {(
            [
              'completed',
              'curing',
              'concreted',
              'formwork',
              'rebar_and_anchor',
              'lean_concrete',
              'excavated',
              'not_started',
            ] as FoundationStatus[]
          ).map((st) => {
              const count = statusCounts[st];
              if (count === 0 && compact) return null;
              return (
                <span
                  key={st}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-white text-slate-700 border-slate-200"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: STATUS_META[st].color }}
                  />
                  {STATUS_META[st].shortLabel}: <strong>{count}</strong>
                </span>
              );
            }
          )}
        </div>
      </div>
      )}

      <div
        className={
          fillParent
            ? `flex-1 min-h-0 flex items-center justify-center bg-white overflow-hidden ${
                hideHeader ? 'p-0.5' : 'p-2 sm:p-4'
              }`
            : 'p-2 sm:p-4 bg-white'
        }
      >
        <svg
          viewBox="30 8 700 672"
          preserveAspectRatio="xMidYMid meet"
          className={
            fillParent
              ? 'w-full h-full max-h-full select-none'
              : `w-full h-auto select-none ${compact ? 'max-h-[460px]' : 'max-h-[600px]'}`
          }
          role="img"
          aria-label="Interactive Ground Anchor Plan for 120m Guyed Mast Tower"
        >
          <defs>
            <pattern id="cad-grid" width="21" height="21" patternUnits="userSpaceOnUse">
              <path d="M 21 0 L 0 0 0 21" fill="none" stroke="#f1f5f9" strokeWidth="0.7" />
            </pattern>
          </defs>

          <rect x="30" y="8" width="700" height="672" fill="url(#cad-grid)" rx="8" />

          {/* Distance Circles (18m, 36m, 54m, 72m) */}
          {[18, 36, 54, 72].map((rM) => (
            <circle
              key={rM}
              cx={cx}
              cy={cy}
              r={rM * scale}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ))}

          {/* 120-degree Sector Angle Arcs matching CAD drawing */}
          <path
            d={`M ${cx + 95 * Math.cos((-30 * Math.PI) / 180)} ${
              cy + 95 * Math.sin((-30 * Math.PI) / 180)
            } A 95 95 0 0 0 ${cx + 95 * Math.cos((-150 * Math.PI) / 180)} ${
              cy + 95 * Math.sin((-150 * Math.PI) / 180)
            }`}
            fill="none"
            stroke="#64748b"
            strokeWidth="1"
          />
          <text x={cx} y={cy - 102} textAnchor="middle" className="fill-slate-600 text-[11px] font-medium">
            120°
          </text>

          <path
            d={`M ${cx + 95 * Math.cos((-150 * Math.PI) / 180)} ${
              cy + 95 * Math.sin((-150 * Math.PI) / 180)
            } A 95 95 0 0 0 ${cx} ${cy + 95}`}
            fill="none"
            stroke="#64748b"
            strokeWidth="1"
          />
          <text
            x={cx - 98}
            y={cy + 34}
            textAnchor="middle"
            transform={`rotate(-58 ${cx - 98} ${cy + 34})`}
            className="fill-slate-600 text-[11px] font-medium"
          >
            120°
          </text>

          {/* Three Radial Axis Centerlines (Dash-Dot) */}
          {[
            { deg: 30, label: 'SECTOR I (30°)' },
            { deg: 150, label: 'SECTOR II (150°)' },
            { deg: 270, label: 'SECTOR III (270°)' },
          ].map((axis) => {
            const rad = (axis.deg * Math.PI) / 180;
            const endX = cx + 77 * scale * Math.cos(rad);
            const endY = cy - 77 * scale * Math.sin(rad);
            const lblX = cx + 82 * scale * Math.cos(rad);
            const lblY = cy - 82 * scale * Math.sin(rad);
            return (
              <g key={axis.deg}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={endX}
                  y2={endY}
                  stroke="#475569"
                  strokeWidth="1.2"
                  strokeDasharray="10 4 2 4"
                />
                <text
                  x={lblX}
                  y={axis.deg === 270 ? lblY + 12 : lblY - 6}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px] font-bold tracking-wider"
                >
                  {axis.label}
                </text>
              </g>
            );
          })}

          {/* 18000 mm Dimension Callouts along Sector III */}
          <line x1={dimX} y1={cy} x2={dimX} y2={cy + 72 * scale} stroke="#64748b" strokeWidth="1" />
          {dimRadii.map((rM, idx) => {
            const y = cy + rM * scale;
            const nextY = idx < dimRadii.length - 1 ? cy + dimRadii[idx + 1] * scale : null;
            return (
              <g key={rM}>
                <line x1={cx + 22} y1={y} x2={dimX + 6} y2={y} stroke="#94a3b8" strokeWidth="0.9" />
                <line x1={dimX - 4} y1={y + 4} x2={dimX + 4} y2={y - 4} stroke="#475569" strokeWidth="1.2" />
                {nextY !== null && (
                  <text
                    x={dimX + 12}
                    y={(y + nextY) / 2 + 4}
                    textAnchor="middle"
                    transform={`rotate(-90 ${dimX + 12} ${(y + nextY) / 2 + 4})`}
                    className="fill-slate-600 text-[10px] font-mono"
                  >
                    18000
                  </text>
                )}
              </g>
            );
          })}

          {/* Sector III CAD Callout Leader Lines */}
          {[
            { rM: 18, label: 'Pull Anchor C (18m)' },
            { rM: 36, label: 'Pull Anchor B (36m)' },
            { rM: 54, label: 'Pull Anchor A (54m)' },
            { rM: 72, label: 'Pull Anchor B (72m)' },
          ].map((item) => {
            const y = cy + item.rM * scale;
            return (
              <g key={item.rM}>
                <polyline
                  points={`${cx - 12},${y} ${cx - 56},${y + 15} ${cx - 190},${y + 15}`}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="0.9"
                />
                <text x={cx - 188} y={y + 11} className="fill-slate-600 text-[10px] font-medium">
                  {item.label}
                </text>
              </g>
            );
          })}

          {/* Foundation Nodes */}
          {foundations.map((f) => {
            const [fx, fy] = toSvg(f.xM, f.zM);
            const spec = FOUNDATION_SPECS[f.type];
            const meta = STATUS_META[f.status];
            const isSelected = f.id === selectedId || highlightedSet.has(f.id);
            const isPrincipal = f.type === 'principal';

            // Visual square size in px (scaled up slightly for comfortable clicking)
            const boxSize = isPrincipal ? 42 : f.type === 'anchor_c' ? 24 : 28;
            const rotDeg = isPrincipal ? 0 : 90 - f.angleDeg;

            return (
              <g
                key={f.id}
                transform={`translate(${fx}, ${fy})`}
                onClick={() => onSelect?.(f.id)}
                className="cursor-pointer group"
              >
                {/* Selection Highlight Rings */}
                {isSelected && (
                  <g>
                    <circle
                      r={boxSize * 1.15}
                      fill="#0284c7"
                      fillOpacity={0.14}
                      stroke="#0284c7"
                      strokeWidth="2.8"
                      strokeDasharray="5 3"
                    />
                    <circle
                      r={boxSize * 0.84}
                      fill="none"
                      stroke="#0369a1"
                      strokeWidth="1.8"
                    />
                  </g>
                )}

                <g transform={`rotate(${rotDeg})`}>
                  {/* Concrete Pad Footprint */}
                  <rect
                    x={-boxSize / 2}
                    y={-boxSize / 2}
                    width={boxSize}
                    height={boxSize}
                    rx="2"
                    fill={meta.color}
                    fillOpacity={f.status === 'not_started' ? 0.2 : 0.85}
                    stroke={isSelected ? '#0369a1' : '#1e293b'}
                    strokeWidth={isSelected ? 2.4 : 1.4}
                  />

                  {isPrincipal ? (
                    /* Triangular 3-Column Tower Base Symbol matching CAD Ground Anchor Plan (pointing South toward Sector III) */
                    <g>
                      <polygon
                        points="0,11 10,-7 -10,-7"
                        fill="none"
                        stroke="#0f172a"
                        strokeWidth="1.4"
                      />
                      <circle cx="0" cy="11" r="3" fill="#ffffff" stroke="#0f172a" strokeWidth="1.2" />
                      <circle cx="10" cy="-7" r="3" fill="#ffffff" stroke="#0f172a" strokeWidth="1.2" />
                      <circle cx="-10" cy="-7" r="3" fill="#ffffff" stroke="#0f172a" strokeWidth="1.2" />
                    </g>
                  ) : (
                    /* Dual inline Ø25mm Ground Anchor Rods along radial axis (+Y) */
                    <g>
                      <line x1="0" y1={-boxSize * 0.08} x2="0" y2={boxSize * 0.62} stroke="#0f172a" strokeWidth="1.5" />
                      {/* Rear ground anchor rod */}
                      <circle cx="0" cy={boxSize * 0.1} r="1.8" fill="#0f172a" />
                      <rect
                        x="-1.8"
                        y={boxSize * 0.14}
                        width="3.6"
                        height="5.5"
                        rx="0.7"
                        fill="#0284c7"
                        stroke="#0f172a"
                        strokeWidth="0.65"
                      />
                      {/* Front (mast-side) ground anchor rod */}
                      <circle
                        cx="0"
                        cy={boxSize * 0.38}
                        r="2.2"
                        fill="#ffffff"
                        stroke="#0f172a"
                        strokeWidth="1.1"
                      />
                      <rect
                        x="-1.8"
                        y={boxSize * 0.42}
                        width="3.6"
                        height="5.5"
                        rx="0.7"
                        fill="#0284c7"
                        stroke="#0f172a"
                        strokeWidth="0.65"
                      />
                    </g>
                  )}
                </g>

                <title>
                  {`${f.name} (${spec.lengthM}×${spec.widthM}×${spec.thicknessM}m)\nStatus: ${meta.label} (${meta.pct}%)\n${spec.anchorSummary}`}
                </title>
              </g>
            );
          })}

          {/* Compact Pad ID + Progress Badges for Overall Status Layout */}
          {showNodeLabels &&
            foundations.map((f) => {
              const [fx, fy] = toSvg(f.xM, f.zM);
              const meta = STATUS_META[f.status];
              const badgeText = `${f.id} · ${meta.pct}%`;
              const badgeW = Math.max(54, Math.ceil(badgeText.length * 5.2) + 10);
              const badgeH = 15;
              let bx = fx - badgeW / 2;
              let by = fy - 36;
              if (f.sector === 'I') {
                bx = fx - 14 - badgeW / 2;
                by = fy - 32;
              } else if (f.sector === 'II') {
                bx = fx + 14 - badgeW / 2;
                by = fy - 32;
              } else if (f.sector === 'III') {
                bx = fx - 18 - badgeW;
                by = fy - 18;
              }
              return (
                <g
                  key={`badge-${f.id}`}
                  onClick={() => onSelect?.(f.id)}
                  className="cursor-pointer"
                >
                  <rect
                    x={bx}
                    y={by}
                    width={badgeW}
                    height={badgeH}
                    rx="3.5"
                    fill="#ffffff"
                    fillOpacity={0.94}
                    stroke={meta.color}
                    strokeWidth="1.2"
                  />
                  <text
                    x={bx + badgeW / 2}
                    y={by + 10.5}
                    textAnchor="middle"
                    className="fill-slate-800 text-[8.5px] font-bold"
                  >
                    {badgeText}
                  </text>
                </g>
              );
            })}

          {/* Status & Activity Legend Box (Lower Right) */}
          <g transform="translate(476, 412)">
            <rect
              x="0"
              y="0"
              width="242"
              height="242"
              rx="6"
              fill="#f8fafc"
              stroke="#cbd5e1"
              strokeWidth="1.2"
            />
            <text
              x="12"
              y="18"
              className="fill-slate-900 text-[10.5px] font-bold tracking-wider uppercase"
            >
              Legend — Activities
            </text>
            <line x1="10" y1="25" x2="232" y2="25" stroke="#cbd5e1" strokeWidth="0.9" />

            {/* Activity Status Swatches matching the 8 construction stages */}
            {(
              [
                { status: 'not_started' as FoundationStatus, label: 'Pending / Not Started' },
                { status: 'excavated' as FoundationStatus, label: '1–2. Excavation & Inspection / Retrofit' },
                { status: 'lean_concrete' as FoundationStatus, label: '3. Lean Concrete Pour' },
                { status: 'rebar_and_anchor' as FoundationStatus, label: '4. Rebar, Anchor / Bolt & Forms Install' },
                { status: 'formwork' as FoundationStatus, label: '5. Rebar, Anchor / Bolt & Forms Inspect' },
                { status: 'concreted' as FoundationStatus, label: '6. Concrete Pouring' },
                { status: 'curing' as FoundationStatus, label: '7. Curing' },
                { status: 'completed' as FoundationStatus, label: '8. Backfill (Completed)' },
              ]
            ).map(({ status, label }, idx) => {
              const sy = 33 + idx * 17;
              const stMeta = STATUS_META[status];
              return (
                <g key={status} transform={`translate(12, ${sy})`}>
                  <rect
                    x="0"
                    y="0"
                    width="11"
                    height="11"
                    rx="2"
                    fill={stMeta.color}
                    fillOpacity={status === 'not_started' ? 0.22 : 0.88}
                    stroke="#1e293b"
                    strokeWidth="0.9"
                  />
                  <text x="17" y="9" className="fill-slate-700 text-[9.5px] font-medium">
                    {label}
                  </text>
                </g>
              );
            })}

            <line x1="10" y1="173" x2="232" y2="173" stroke="#e2e8f0" strokeWidth="0.9" />

            {/* Selected Foundation Ring */}
            <g transform="translate(17, 188)">
              <circle
                cx="0"
                cy="0"
                r="6.5"
                fill="#0284c7"
                fillOpacity={0.14}
                stroke="#0284c7"
                strokeWidth="1.6"
                strokeDasharray="2.5 1.5"
              />
              <rect
                x="-3.5"
                y="-3.5"
                width="7"
                height="7"
                rx="1"
                fill="#ffffff"
                stroke="#0369a1"
                strokeWidth="1.1"
              />
              <text x="14" y="3.5" className="fill-slate-800 text-[9.5px] font-semibold">
                Selected / Current Foundation
              </text>
            </g>

            {/* PF-0 Principal Base Symbol */}
            <g transform="translate(17, 208)">
              <rect
                x="-6"
                y="-6"
                width="12"
                height="12"
                rx="1.5"
                fill="#e2e8f0"
                stroke="#1e293b"
                strokeWidth="0.9"
              />
              <polygon points="0,3.5 3.5,-2.5 -3.5,-2.5" fill="none" stroke="#0f172a" strokeWidth="1" />
              <text x="14" y="3.5" className="fill-slate-700 text-[9.5px] font-medium">
                PF-0 Principal Base (Bolt Frame)
              </text>
            </g>

            {/* Pull Anchor Dual Rod Symbol */}
            <g transform="translate(17, 228)">
              <rect
                x="-5.5"
                y="-5.5"
                width="11"
                height="11"
                rx="1.5"
                fill="#e2e8f0"
                stroke="#1e293b"
                strokeWidth="0.9"
              />
              <line x1="0" y1="-2" x2="0" y2="6.5" stroke="#0f172a" strokeWidth="1.2" />
              <rect x="-1.5" y="1" width="3" height="2.2" fill="#0284c7" />
              <text x="14" y="3.5" className="fill-slate-700 text-[9.5px] font-medium">
                Pull Anchor (Ground Anchor Rods)
              </text>
            </g>
          </g>

          {/* High-Visibility Leader & Callout for Currently Selected / Worked Foundation(s) */}
          {(() => {
            const targets =
              highlightedIds && highlightedIds.length > 0
                ? foundations.filter((f) => highlightedSet.has(f.id))
                : foundations.filter((f) => f.id === selectedId);
            if (targets.length === 0) return null;

            const isSingle = targets.length === 1;
            const boxH = isSingle ? 38 : 18;

            return targets.map((sel) => {
              const [fx, fy] = toSvg(sel.xM, sel.zM);
              const spec = FOUNDATION_SPECS[sel.type];
              const meta = STATUS_META[sel.status];
              const singleLabel = `${sel.id} · ${spec.label} (${meta.pct}%)`;
              const boxW = computeCalloutBoxWidth(singleLabel, isSingle);
              const { elbowX, elbowY, boxX, align } = getSelectionLeaderLayout(
                sel,
                fx,
                fy,
                boxW,
                isSingle
              );
              const boxY = elbowY - boxH / 2;
              const tailX = align === 'right' ? boxX : boxX + boxW;
              const leaderPoints =
                align === 'center'
                  ? `${fx},${fy} ${elbowX},${elbowY + boxH / 2}`
                  : `${fx},${fy} ${elbowX},${elbowY} ${tailX},${elbowY}`;

              return (
                <g key={`callout-${sel.id}`} className="pointer-events-none">
                  {/* White halo under leader so it reads cleanly over grid lines & rings */}
                  <polyline
                    points={leaderPoints}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={leaderPoints}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx={fx}
                    cy={fy}
                    r="4.2"
                    fill="#0284c7"
                    stroke="#ffffff"
                    strokeWidth="1.6"
                  />
                  <rect
                    x={boxX}
                    y={boxY}
                    width={boxW}
                    height={boxH}
                    rx="5"
                    fill="#0284c7"
                    stroke="#0f172a"
                    strokeWidth="1.3"
                  />
                  {isSingle ? (
                    <>
                      <text
                        x={boxX + boxW / 2}
                        y={boxY + 14}
                        textAnchor="middle"
                        className="text-[9px] font-bold fill-sky-100 tracking-wider uppercase"
                      >
                        {calloutTitle}
                      </text>
                      <text
                        x={boxX + boxW / 2}
                        y={boxY + 28.5}
                        textAnchor="middle"
                        className="text-[10.5px] font-bold fill-white"
                      >
                        {singleLabel}
                      </text>
                    </>
                  ) : (
                    <text
                      x={boxX + boxW / 2}
                      y={boxY + 12.2}
                      textAnchor="middle"
                      className="text-[9px] font-bold fill-white tracking-tight"
                    >
                      WORK: {sel.id}
                    </text>
                  )}
                </g>
              );
            });
          })()}
        </svg>
      </div>
    </div>
  );
}

