export const BAGS_PER_CUBIC_METER = 36; // From Pull Anchor Details - DRAFT.pdf
export const DEFAULT_KG_PER_BAG = 40; // Standard 40kg cement bag / empty cement sack for aggregates
export const DEFAULT_SAFETY_OFFICER_NAME = 'Flordeliza Manjares';

export const PROJECT_MATERIAL_TARGETS = {
  cementBagsExact: 618,
  cementBagsTotal: 649, // incl 5% wastage
  sandCuMExact: 26,
  sandCuMTotal: 28,
  gravelCuMExact: 52,
  gravelCuMTotal: 55,
  rebar20mmCommercialPcs: 146, // Net 6m bars after using existing cuts
  phenolicBoardsPcs: 32,
  peakManpower: 18,
} as const;

