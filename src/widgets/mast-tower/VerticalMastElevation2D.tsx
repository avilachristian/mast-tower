import { useState } from 'react';
import type {
  AnchorGuyStage,
  GuyLayerRecord,
  TowerSectionRecord,
  TowerSectionStatus,
  VerticalMastState,
} from '@/entities/project/types';
import {
  ANCHOR_GUY_STAGE_META,
  GUY_LAYER_STATUS_META,
  SIMPLIFIED_TOWER_SECTION_STATUSES,
  TOWER_SECTION_STATUS_META,
} from '@/entities/project/verticalMastBaseline';
import type { MastSelectionTarget } from '@/shared/state/uiStore';

type ElevationFocus = 'all' | 'lower' | 'upper';

export function VerticalMastElevation2D({
  verticalMast,
  selectedTarget,
  onSelectTarget,
  title = 'Vertical Mast & 16-Layer Guying Elevation (ZT-120-01)',
  subtitle = 'Click any tower section (S01–S41) or guy cable layer (L01–L16) to inspect or update erection progress',
  compact = false,
  fillParent = false,
  hideHeader = false,
}: {
  verticalMast: VerticalMastState;
  selectedTarget?: MastSelectionTarget | null;
  onSelectTarget?: (target: MastSelectionTarget) => void;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  fillParent?: boolean;
  hideHeader?: boolean;
}) {
  const [focus, setFocus] = useState<ElevationFocus>('all');

  const cx = 360;
  const yGround = 528;
  const xScale = 3.6; // ±72m -> ±259.2px (x = 100.8 .. 619.2)
  const yScale = 3.6; // 129m (41x3m + 6m rod) -> 464.4px (peak y = 63.6)
  const towerHalfW = 12;

  const yAtElev = (elevM: number) => yGround - elevM * yScale;
  const xAtOffset = (offsetM: number) => cx + offsetM * xScale;

  const viewBoxByFocus: Record<ElevationFocus, string> = {
    all: '0 0 760 595',
    lower: '0 270 760 325',
    upper: '0 0 760 335',
  };

  const sectionCounts = verticalMast.sections.reduce<Record<TowerSectionStatus, number>>(
    (acc, sec) => {
      acc[sec.status] = (acc[sec.status] ?? 0) + 1;
      return acc;
    },
    {
      not_started: 0,
      pre_assembled: 0,
      hoisted: 0,
      bolted_torqued: 0,
      plumbed_verified: 0,
    }
  );

  const selectedSection: TowerSectionRecord | undefined =
    selectedTarget?.kind === 'section'
      ? verticalMast.sections.find((s) => s.id === selectedTarget.id)
      : undefined;
  const selectedGuyLayer: GuyLayerRecord | undefined =
    selectedTarget?.kind === 'guy_layer'
      ? verticalMast.guyLayers.find((g) => g.id === selectedTarget.id)
      : undefined;

  const anchorStations = [
    { label: 'B2', offsetM: -72, dist: '72m' },
    { label: 'A1', offsetM: -54, dist: '54m' },
    { label: 'B1', offsetM: -36, dist: '36m' },
    { label: 'C1', offsetM: -18, dist: '18m' },
    { label: 'PF-0', offsetM: 0, dist: '0m' },
    { label: 'C1', offsetM: 18, dist: '18m' },
    { label: 'B1', offsetM: 36, dist: '36m' },
    { label: 'A1', offsetM: 54, dist: '54m' },
    { label: 'B2', offsetM: 72, dist: '72m' },
  ];

  const topSection = verticalMast.sections[verticalMast.sections.length - 1];
  const rodMeta = TOWER_SECTION_STATUS_META[topSection?.status ?? 'not_started'];

  const getAnchorRingGuyState = (
    radiusM: number,
    side: 'left' | 'right'
  ): {
    stage: AnchorGuyStage;
    color: string;
    pulledCount: number;
    anchoredCount: number;
    tensionedCount: number;
    totalGuys: number;
  } => {
    const layers = verticalMast.guyLayers.filter((g) => g.anchorRadiusM === radiusM);
    const totalGuys = layers.length;
    const sectorKeys: readonly ('I' | 'II' | 'III')[] =
      side === 'right' ? ['I'] : ['II', 'III'];

    const pulledCount = layers.filter((g) =>
      sectorKeys.some(
        (k) =>
          g.sectors[k].pulled ||
          g.sectors[k].terminated ||
          g.sectors[k].tensioned
      )
    ).length;
    const anchoredCount = layers.filter((g) =>
      sectorKeys.some((k) => g.sectors[k].terminated || g.sectors[k].tensioned)
    ).length;
    const tensionedCount = layers.filter((g) =>
      sectorKeys.every((k) => g.sectors[k].tensioned)
    ).length;

    const stage: AnchorGuyStage =
      totalGuys > 0 && tensionedCount >= totalGuys
        ? 'all_tensioned'
        : anchoredCount >= 4
          ? 'guy_4'
          : anchoredCount === 3
            ? 'guy_3'
            : anchoredCount === 2
              ? 'guy_2'
              : anchoredCount === 1
                ? 'guy_1'
                : pulledCount > 0
                  ? 'pulled'
                  : 'pending';

    return {
      stage,
      color: ANCHOR_GUY_STAGE_META[stage].color,
      pulledCount,
      anchoredCount,
      tensionedCount,
      totalGuys,
    };
  };

  const baseS01 = verticalMast.sections[0];
  const verifiedSecCount = verticalMast.sections.filter(
    (s) => s.status === 'plumbed_verified'
  ).length;
  const baseStage: AnchorGuyStage =
    baseS01?.status === 'plumbed_verified' ? 'all_tensioned' : 'pending';
  const basePadColor = ANCHOR_GUY_STAGE_META[baseStage].color;

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
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px]">
              {(
                [
                  { id: 'all', label: 'Full 129m' },
                  { id: 'upper', label: 'Upper 60–129m' },
                  { id: 'lower', label: 'Lower 0–60m' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFocus(opt.id)}
                  className={`px-2 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                    focus === opt.id
                      ? 'bg-white text-sky-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stage Pill Strip */}
      {!hideHeader && (
        <div className="px-4 py-1.5 bg-slate-50/40 border-b border-slate-100 flex flex-wrap items-center gap-1.5 text-[10.5px]">
          {SIMPLIFIED_TOWER_SECTION_STATUSES.map((st) => {
            const count =
              st === 'plumbed_verified'
                ? sectionCounts.plumbed_verified
                : verticalMast.sections.length - sectionCounts.plumbed_verified;
            return (
              <span
                key={st}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-white text-slate-700 border-slate-200"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: TOWER_SECTION_STATUS_META[st].color }}
                />
                <span>
                  {TOWER_SECTION_STATUS_META[st].shortLabel}: <strong>{count}</strong>
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Interactive SVG Elevation */}
      <div
        className={
          fillParent
            ? 'p-1 flex-1 min-h-0 flex items-center justify-center bg-slate-50/40'
            : 'p-2 sm:p-3 bg-slate-50/40'
        }
      >
        <svg
          viewBox={viewBoxByFocus[focus]}
          className={
            fillParent
              ? 'w-full h-full max-w-full max-h-full select-none'
              : compact
                ? 'w-full max-h-[540px] mx-auto select-none'
                : 'w-full max-h-[640px] mx-auto select-none'
          }
          role="img"
          aria-label="Vertical 120m Mast Tower and 16-Layer Guying Elevation Diagram"
        >
          {/* Sky-to-Ground Horizontal Elevation Gridlines (every 15m) */}
          {[0, 15, 30, 45, 60, 75, 90, 105, 120].map((elev) => {
            const y = yAtElev(elev);
            return (
              <g key={elev}>
                <line
                  x1={52}
                  y1={y}
                  x2={644}
                  y2={y}
                  stroke={elev === 0 ? '#334155' : '#e2e8f0'}
                  strokeWidth={elev === 0 ? 2 : 1}
                  strokeDasharray={elev === 0 ? undefined : '3 4'}
                />
                <text
                  x={46}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize={9.5}
                  fontWeight={elev === 0 || elev === 120 ? 700 : 500}
                  fill="#475569"
                >
                  {elev === 0 ? '±0.0m' : `${elev}m`}
                </text>
              </g>
            );
          })}

          {/* Peak 123m (Top of S41) & 129m (6m Lightning Rod Tip) References */}
          <line
            x1={cx - 48}
            y1={yAtElev(123)}
            x2={cx + 36}
            y2={yAtElev(123)}
            stroke="#94a3b8"
            strokeWidth={0.9}
            strokeDasharray="2 3"
          />
          <line
            x1={cx - 48}
            y1={yAtElev(129)}
            x2={cx + 32}
            y2={yAtElev(129)}
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text
            x={46}
            y={yAtElev(129) + 3}
            textAnchor="end"
            fontSize={9}
            fontWeight={600}
            fill="#64748b"
          >
            129m
          </text>

          {/* Left Overall Dimension Bracket (0 - 129m) */}
          <g stroke="#94a3b8" strokeWidth={1}>
            <line x1={14} y1={yAtElev(129)} x2={14} y2={yGround} />
            <line x1={10} y1={yAtElev(129)} x2={18} y2={yAtElev(129)} />
            <line x1={10} y1={yGround} x2={18} y2={yGround} />
          </g>
          <text
            x={10}
            y={(yAtElev(129) + yGround) / 2}
            textAnchor="middle"
            fontSize={8.5}
            fontWeight={700}
            fill="#64748b"
            transform={`rotate(-90 10 ${(yAtElev(129) + yGround) / 2})`}
          >
            123m MAST (41 SEC) + 6m LIGHTNING ROD
          </text>

          {/* Ground Cross-Section Hatch Below ±0.0m */}
          <rect
            x={52}
            y={yGround}
            width={592}
            height={14}
            fill="#f1f5f9"
            opacity={0.75}
          />
          <line
            x1={52}
            y1={yGround}
            x2={644}
            y2={yGround}
            stroke="#334155"
            strokeWidth={2}
          />

          {/* Guy Cable Layers (L01 .. L16) Drawn Symmetric Left & Right */}
          {verticalMast.guyLayers.map((layer) => {
            const yAttach = yAtElev(layer.elevationM);
            const xAnchorLeft = xAtOffset(-layer.anchorRadiusM);
            const xAnchorRight = xAtOffset(layer.anchorRadiusM);
            const isSelected =
              selectedGuyLayer?.id === layer.id ||
              selectedSection?.guyLayerIds.includes(layer.id);
            const meta = GUY_LAYER_STATUS_META[layer.status];
            const tensionedCount = ['I', 'II', 'III'].filter(
              (k) => layer.sectors[k as 'I' | 'II' | 'III'].tensioned
            ).length;

            const leftRingState = getAnchorRingGuyState(layer.anchorRadiusM, 'left');
            const rightRingState = getAnchorRingGuyState(layer.anchorRadiusM, 'right');

            const leftSec =
              layer.sectors.II.tensioned || layer.sectors.III.tensioned
                ? 'tensioned'
                : layer.sectors.II.terminated || layer.sectors.III.terminated
                  ? 'anchored'
                  : layer.sectors.II.pulled || layer.sectors.III.pulled
                    ? 'pulled'
                    : 'pending';
            const rightSec = layer.sectors.I.tensioned
              ? 'tensioned'
              : layer.sectors.I.terminated
                ? 'anchored'
                : layer.sectors.I.pulled
                  ? 'pulled'
                  : 'pending';

            const colorForSide = (
              secState: 'pending' | 'pulled' | 'anchored' | 'tensioned',
              ringState: typeof leftRingState
            ) =>
              secState === 'tensioned'
                ? ANCHOR_GUY_STAGE_META.all_tensioned.color
                : secState === 'anchored'
                  ? ringState.color
                  : secState === 'pulled'
                    ? ANCHOR_GUY_STAGE_META.pulled.color
                    : ANCHOR_GUY_STAGE_META.pending.color;

            const leftColor = colorForSide(leftSec, leftRingState);
            const rightColor = colorForSide(rightSec, rightRingState);
            const badgeColor =
              layer.status === 'tensioned_verified'
                ? ANCHOR_GUY_STAGE_META.all_tensioned.color
                : rightSec === 'anchored'
                  ? rightRingState.color
                  : leftSec === 'anchored'
                    ? leftRingState.color
                    : rightSec === 'tensioned' || leftSec === 'tensioned'
                      ? ANCHOR_GUY_STAGE_META.all_tensioned.color
                      : rightSec === 'pulled' || leftSec === 'pulled'
                        ? ANCHOR_GUY_STAGE_META.pulled.color
                        : ANCHOR_GUY_STAGE_META.pending.color;
            const leftActive = leftSec !== 'pending';
            const rightActive = rightSec !== 'pending';

            return (
              <g
                key={layer.id}
                onClick={() =>
                  onSelectTarget?.({ kind: 'guy_layer', id: layer.id })
                }
                className={onSelectTarget ? 'cursor-pointer' : undefined}
              >
                <title>
                  {`${layer.id} (${layer.elevationM.toFixed(1)}m → ${layer.anchorRingLabel}): ${meta.label} (${tensionedCount}/3 sectors tensioned)`}
                </title>

                {/* Highlight halo behind selected guy wires */}
                {isSelected && (
                  <>
                    <line
                      x1={cx - towerHalfW}
                      y1={yAttach}
                      x2={xAnchorLeft}
                      y2={yGround}
                      stroke="#0284c7"
                      strokeWidth={5.2}
                      strokeOpacity={0.3}
                    />
                    <line
                      x1={cx + towerHalfW}
                      y1={yAttach}
                      x2={xAnchorRight}
                      y2={yGround}
                      stroke="#0284c7"
                      strokeWidth={5.2}
                      strokeOpacity={0.3}
                    />
                  </>
                )}

                {/* Visible symmetric guy strands colored by anchored-guy & legend stage */}
                <line
                  x1={cx - towerHalfW}
                  y1={yAttach}
                  x2={xAnchorLeft}
                  y2={yGround}
                  stroke={leftColor}
                  strokeWidth={isSelected ? 2.5 : leftActive ? 1.9 : 1.1}
                  strokeDasharray={leftActive ? undefined : '4 3'}
                  strokeOpacity={leftActive || isSelected ? 0.96 : 0.65}
                />
                <line
                  x1={cx + towerHalfW}
                  y1={yAttach}
                  x2={xAnchorRight}
                  y2={yGround}
                  stroke={rightColor}
                  strokeWidth={isSelected ? 2.5 : rightActive ? 1.9 : 1.1}
                  strokeDasharray={rightActive ? undefined : '4 3'}
                  strokeOpacity={rightActive || isSelected ? 0.96 : 0.65}
                />

                {/* Generous invisible hit targets along cables */}
                <line
                  x1={cx - towerHalfW}
                  y1={yAttach}
                  x2={xAnchorLeft}
                  y2={yGround}
                  stroke="transparent"
                  strokeWidth={9}
                />
                <line
                  x1={cx + towerHalfW}
                  y1={yAttach}
                  x2={xAnchorRight}
                  y2={yGround}
                  stroke="transparent"
                  strokeWidth={9}
                />

                {/* Guy attachment node dots on tower */}
                <circle
                  cx={cx - towerHalfW}
                  cy={yAttach}
                  r={isSelected ? 3.5 : 2.3}
                  fill={leftColor}
                  stroke="#ffffff"
                  strokeWidth={0.8}
                />
                <circle
                  cx={cx + towerHalfW}
                  cy={yAttach}
                  r={isSelected ? 3.5 : 2.3}
                  fill={rightColor}
                  stroke="#ffffff"
                  strokeWidth={0.8}
                />

                {/* Right-hand Elevation & Sector Tag Column (guaranteed zero overlap) */}
                <line
                  x1={cx + towerHalfW + 2}
                  y1={yAttach}
                  x2={650}
                  y2={yAttach}
                  stroke={isSelected ? '#0284c7' : '#cbd5e1'}
                  strokeWidth={isSelected ? 1.2 : 0.7}
                  strokeDasharray="2 2"
                />
                <g>
                  <rect
                    x={651}
                    y={yAttach - 7.5}
                    width={103}
                    height={15}
                    rx={3}
                    fill={isSelected ? '#0284c7' : '#ffffff'}
                    stroke={isSelected ? '#0369a1' : badgeColor}
                    strokeWidth={isSelected ? 1.4 : 1}
                  />
                  <text
                    x={656}
                    y={yAttach + 3}
                    fontSize={8.5}
                    fontWeight={700}
                    fill={isSelected ? '#ffffff' : '#0f172a'}
                  >
                    {layer.id} · {layer.elevationM}m
                  </text>
                  {/* 3 Tiny Sector Readiness Dots (I / II / III) */}
                  {(['I', 'II', 'III'] as const).map((secKey, idx) => {
                    const sec = layer.sectors[secKey];
                    const secRingState = getAnchorRingGuyState(
                      layer.anchorRadiusM,
                      secKey === 'I' ? 'right' : 'left'
                    );
                    const dotColor = sec.tensioned
                      ? ANCHOR_GUY_STAGE_META.all_tensioned.color
                      : sec.terminated
                        ? secRingState.color
                        : sec.pulled
                          ? ANCHOR_GUY_STAGE_META.pulled.color
                          : isSelected
                            ? '#bae6fd'
                            : '#cbd5e1';
                    return (
                      <circle
                        key={secKey}
                        cx={733 + idx * 7}
                        cy={yAttach}
                        r={2.4}
                        fill={dotColor}
                      />
                    );
                  })}
                </g>
              </g>
            );
          })}

          {/* 41 Modular Tower Sections (S01 .. S41, each 3.0m = 123m) */}
          {verticalMast.sections.map((sec) => {
            const yTop = yAtElev(sec.elevationToM);
            const yBot = yAtElev(sec.elevationFromM);
            const h = yBot - yTop;
            const meta = TOWER_SECTION_STATUS_META[sec.status];
            const isSelected = selectedSection?.id === sec.id;
            const isDone = sec.status !== 'not_started';
            const strokeColor = isSelected ? '#0284c7' : isDone ? meta.color : '#94a3b8';

            return (
              <g
                key={sec.id}
                onClick={() =>
                  onSelectTarget?.({ kind: 'section', id: sec.id })
                }
                className={onSelectTarget ? 'cursor-pointer' : undefined}
              >
                <title>
                  {`${sec.id} (${sec.elevationFromM}–${sec.elevationToM}m) · ${sec.label} · ${meta.label}`}
                </title>

                {/* Active selection background glow */}
                {isSelected && (
                  <rect
                    x={cx - towerHalfW - 4}
                    y={yTop - 1}
                    width={(towerHalfW + 4) * 2}
                    height={h + 2}
                    rx={2}
                    fill="#0284c7"
                    fillOpacity={0.18}
                    stroke="#0284c7"
                    strokeWidth={1.6}
                  />
                )}

                {/* Section body fill */}
                <rect
                  x={cx - towerHalfW}
                  y={yTop}
                  width={towerHalfW * 2}
                  height={h}
                  fill={isDone ? meta.color : '#f8fafc'}
                  fillOpacity={isSelected ? 0.35 : isDone ? 0.22 : 0.8}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 1.8 : 1.1}
                  strokeDasharray={isDone ? undefined : '2.5 2'}
                />

                {/* Center mast spine + diagonal truss graphic inside module */}
                <line
                  x1={cx}
                  y1={yTop}
                  x2={cx}
                  y2={yBot}
                  stroke={strokeColor}
                  strokeWidth={0.9}
                  strokeOpacity={isDone ? 0.85 : 0.4}
                />
                <line
                  x1={cx - towerHalfW}
                  y1={yBot}
                  x2={cx + towerHalfW}
                  y2={yTop}
                  stroke={strokeColor}
                  strokeWidth={0.75}
                  strokeOpacity={isDone ? 0.75 : 0.35}
                />
                <line
                  x1={cx - towerHalfW}
                  y1={yTop}
                  x2={cx + towerHalfW}
                  y2={yBot}
                  stroke={strokeColor}
                  strokeWidth={0.75}
                  strokeOpacity={isDone ? 0.75 : 0.35}
                />

                {/* Wider invisible hit rect for easy clicking */}
                <rect
                  x={cx - towerHalfW - 8}
                  y={yTop}
                  width={(towerHalfW + 8) * 2}
                  height={h}
                  fill="transparent"
                />

                {/* Every 5th section index label & top S41 on left of mast */}
                {(sec.sectionNo === 1 ||
                  sec.sectionNo === 41 ||
                  (sec.sectionNo % 5 === 0 && sec.sectionNo <= 35) ||
                  isSelected) && (
                  <g>
                    <text
                      x={cx - towerHalfW - 6}
                      y={(yTop + yBot) / 2 + 3}
                      textAnchor="end"
                      fontSize={isSelected ? 9.5 : 8}
                      fontWeight={isSelected ? 800 : 600}
                      fill={isSelected ? '#0369a1' : '#475569'}
                    >
                      {sec.id}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 7.0m Working Platform Callout (Section S03) */}
          <g>
            <rect
              x={cx - towerHalfW - 5}
              y={yAtElev(7.0) - 2}
              width={(towerHalfW + 5) * 2}
              height={4}
              rx={1}
              fill={
                verticalMast.platformStatus === 'verified'
                  ? '#10b981'
                  : verticalMast.platformStatus === 'installed'
                    ? '#3b82f6'
                    : '#94a3b8'
              }
              stroke="#0f172a"
              strokeWidth={0.8}
            />
            <text
              x={cx - towerHalfW - 36}
              y={yAtElev(7.0) + 3}
              textAnchor="end"
              fontSize={8.5}
              fontWeight={700}
              fill="#0f172a"
            >
              7.0m Platform
            </text>
            <line
              x1={cx - towerHalfW - 34}
              y1={yAtElev(7.0)}
              x2={cx - towerHalfW - 6}
              y2={yAtElev(7.0)}
              stroke="#475569"
              strokeWidth={0.8}
            />
          </g>

          {/* 6.0m Top Lightning Rod (123m -> 129m, mounted on S41, no guy wire) */}
          <g
            onClick={() => onSelectTarget?.({ kind: 'section', id: 'S41' })}
            className={onSelectTarget ? 'cursor-pointer' : undefined}
          >
            <line
              x1={cx}
              y1={yAtElev(123)}
              x2={cx}
              y2={yAtElev(129)}
              stroke={rodMeta.color}
              strokeWidth={2.5}
            />
            <polygon
              points={`${cx},${yAtElev(129) - 3} ${cx - 3.5},${yAtElev(129) + 5} ${cx + 3.5},${yAtElev(129) + 5}`}
              fill={rodMeta.color}
            />
            <text
              x={cx + 8}
              y={yAtElev(126) + 2}
              fontSize={8.5}
              fontWeight={700}
              fill="#334155"
            >
              6m Lightning Rod (S41 · No Guy)
            </text>
          </g>

          {/* Ground Anchor Pad Symbols & Radial Distance Ticks Colored by Guy Anchorage Legend */}
          {anchorStations.map((st, idx) => {
            const ax = xAtOffset(st.offsetM);
            const isCenter = st.offsetM === 0;
            const ringMatches =
              selectedGuyLayer &&
              Math.abs(st.offsetM) === selectedGuyLayer.anchorRadiusM;
            const ringState = !isCenter
              ? getAnchorRingGuyState(
                  Math.abs(st.offsetM),
                  st.offsetM > 0 ? 'right' : 'left'
                )
              : null;
            const padColor = isCenter ? basePadColor : ringState!.color;
            const isPadPending = isCenter
              ? baseStage === 'pending'
              : ringState!.stage === 'pending';

            return (
              <g key={`${st.label}-${idx}`}>
                <title>
                  {isCenter
                    ? `PF-0 Tower Base: ${verifiedSecCount}/${verticalMast.sections.length} sections verified`
                    : `${st.label} (${st.dist}): ${ANCHOR_GUY_STAGE_META[ringState!.stage].label} (${ringState!.anchoredCount}/${ringState!.totalGuys} anchored, ${ringState!.tensionedCount}/${ringState!.totalGuys} tensioned)`}
                </title>
                {ringMatches && (
                  <rect
                    x={ax - (isCenter ? 16.5 : 11.5)}
                    y={yGround - 1.5}
                    width={isCenter ? 33 : 23}
                    height={16}
                    rx={2.5}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth={1.8}
                    strokeDasharray="3 2"
                  />
                )}
                <rect
                  x={ax - (isCenter ? 14 : 9)}
                  y={yGround + 1}
                  width={isCenter ? 28 : 18}
                  height={11}
                  rx={1.5}
                  fill={padColor}
                  fillOpacity={isPadPending ? 0.28 : 0.92}
                  stroke={ringMatches ? '#0369a1' : '#0f172a'}
                  strokeWidth={ringMatches ? 1.5 : 1}
                />
                <text
                  x={ax}
                  y={yGround + 24}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={ringMatches || isCenter ? 800 : 600}
                  fill={ringMatches ? '#0369a1' : '#334155'}
                >
                  {st.label}
                </text>
                <text
                  x={ax}
                  y={yGround + 35}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#64748b"
                >
                  {isCenter
                    ? `${st.dist}`
                    : `${st.dist} (${ringState!.anchoredCount}/${ringState!.totalGuys})`}
                </text>
              </g>
            );
          })}

          {/* Horizontal Spacing Bar (18m intervals) */}
          <g stroke="#94a3b8" strokeWidth={0.9}>
            <line
              x1={xAtOffset(-72)}
              y1={yGround + 47}
              x2={xAtOffset(72)}
              y2={yGround + 47}
            />
            {[-72, -54, -36, -18, 0, 18, 36, 54, 72].map((m) => (
              <line
                key={m}
                x1={xAtOffset(m)}
                y1={yGround + 43}
                x2={xAtOffset(m)}
                y2={yGround + 51}
              />
            ))}
          </g>
          {[-63, -45, -27, -9, 9, 27, 45, 63].map((mid) => (
            <text
              key={mid}
              x={xAtOffset(mid)}
              y={yGround + 59}
              textAnchor="middle"
              fontSize={8}
              fill="#64748b"
            >
              18m
            </text>
          ))}

          {/* Dedicated Vertical Elevation Legend Matched to Guy Wire & Anchor Pad Colors */}
          {focus !== 'lower' && (
            <g transform="translate(56, 14)">
              <rect
                x={0}
                y={0}
                width={196}
                height={162}
                rx={6}
                fill="#ffffff"
                fillOpacity={0.96}
                stroke="#cbd5e1"
                strokeWidth={1}
              />
              <text x={10} y={14} fontSize={8.5} fontWeight={700} fill="#0f172a">
                ELEVATION LEGEND (ZT-120-01)
              </text>
              <line x1={10} y1={19} x2={186} y2={19} stroke="#e2e8f0" strokeWidth={0.8} />

              {/* Simplified Tower Leg Status */}
              <text x={10} y={29} fontSize={7.5} fontWeight={700} fill="#475569">
                TOWER LEGS (S01–S41) &amp; PF-0 BASE
              </text>
              <g fontSize={8} fill="#334155">
                <rect x={10} y={33} width={11} height={8} rx={1.5} fill="#10b981" fillOpacity={0.28} stroke="#10b981" strokeWidth={1.1} />
                <text x={25} y={40}>Tower Leg Installed</text>

                <rect x={10} y={46} width={11} height={8} rx={1.5} fill="#94a3b8" fillOpacity={0.14} stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 1" />
                <text x={25} y={53}>Pending Installation</text>
              </g>

              <line x1={10} y1={59} x2={186} y2={59} stroke="#e2e8f0" strokeWidth={0.8} />

              {/* Guy Cable Wires & Ground Anchor Pads (exact match to 2D Plan) */}
              <text x={10} y={69} fontSize={7.5} fontWeight={700} fill="#475569">
                GUY WIRES &amp; ANCHOR PADS (L01–L16)
              </text>
              <g fontSize={8} fill="#334155">
                <line x1={10} y1={77} x2={24} y2={77} stroke={ANCHOR_GUY_STAGE_META.pending.color} strokeWidth={1.4} strokeDasharray="3 2" />
                <text x={28} y={80}>{ANCHOR_GUY_STAGE_META.pending.legendLabel}</text>

                <line x1={10} y1={90} x2={24} y2={90} stroke={ANCHOR_GUY_STAGE_META.guy_1.color} strokeWidth={2.2} />
                <text x={28} y={93}>{ANCHOR_GUY_STAGE_META.guy_1.legendLabel}</text>

                <line x1={10} y1={103} x2={24} y2={103} stroke={ANCHOR_GUY_STAGE_META.guy_2.color} strokeWidth={2.2} />
                <text x={28} y={106}>{ANCHOR_GUY_STAGE_META.guy_2.legendLabel}</text>

                <line x1={10} y1={116} x2={24} y2={116} stroke={ANCHOR_GUY_STAGE_META.guy_3.color} strokeWidth={2.2} />
                <text x={28} y={119}>{ANCHOR_GUY_STAGE_META.guy_3.legendLabel}</text>

                <line x1={10} y1={129} x2={24} y2={129} stroke={ANCHOR_GUY_STAGE_META.guy_4.color} strokeWidth={2.2} />
                <text x={28} y={132}>{ANCHOR_GUY_STAGE_META.guy_4.legendLabel}</text>

                <line x1={10} y1={142} x2={24} y2={142} stroke={ANCHOR_GUY_STAGE_META.all_tensioned.color} strokeWidth={2.4} />
                <text x={28} y={145}>5. All Cables Tensioned (Verified)</text>
              </g>

              <line x1={10} y1={151} x2={186} y2={151} stroke="#e2e8f0" strokeWidth={0.8} />
              <text x={10} y={158.5} fontSize={7} fill="#64748b">
                Wire &amp; C1–B2 pad colors match Anchor Plan
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

