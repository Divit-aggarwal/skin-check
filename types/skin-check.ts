// Question variants for the /skin-check funnel — all 8 typed variants used
// across Sections 1-5.

interface BaseStep {
  id: string;
  prompt: string;
  /** When present, this step is only included in the flow if this returns true for the current answers. */
  condition?: (answers: SkinCheckAnswers) => boolean;
}

export interface TextStep extends BaseStep {
  type: "text";
  placeholder: string;
}

export interface PhoneStep extends BaseStep {
  type: "phone";
  note: string;
  /**
   * True only for the flow's final step, which writes the finished scan to
   * Firestore once the user confirms. The pre-capture "verify" step leaves
   * this unset: it authenticates and nothing else — there is no completed
   * questionnaire to save at that point.
   */
  savesScan?: boolean;
}

export interface PhotoCaptureStep extends BaseStep {
  type: "photo-capture";
  note: string;
}

export interface ChipOption {
  value: string;
  label: string;
}

export interface SingleSelectChipsStep extends BaseStep {
  type: "single-select-chips";
  options: ChipOption[];
  note?: string;
}

export interface CardOption {
  value: string;
  label: string;
  description: string;
}

export interface SingleSelectCardsStep extends BaseStep {
  type: "single-select-cards";
  options: CardOption[];
}

export interface ImageCardOption {
  value: string;
  label: string;
  description?: string;
  /**
   * A small picture of what the option means (public/quiz/). The owner can
   * swap a file by putting their own under the same name. `alt` is what a
   * screen reader says.
   */
  image?: { src: string; alt: string };
}

export interface MultiSelectCardsStep extends BaseStep {
  type: "multi-select-cards";
  options: ImageCardOption[];
  note?: string;
  /** Selecting this option value clears every other selection, and vice versa. */
  exclusiveValue?: string;
  /** Once this many are selected, remaining unselected options are disabled. */
  maxSelections?: number;
  /** TD-33 (2): option value → label of the optional name box shown under it while picked. */
  nameBoxes?: Record<string, string>;
}

export interface BodyZoneOption {
  value: string;
  label: string;
}

// Simplified checklist fallback for the acne-area body map — see Step 0/
// Phase 1 notes: an interactive SVG hotspot diagram is flagged as a follow-up.
export interface BodyMapStep extends BaseStep {
  type: "body-map";
  options: BodyZoneOption[];
  /** Once this many are selected, remaining unselected options are disabled. */
  maxSelections?: number;
}

export interface Scale1to5Step extends BaseStep {
  type: "scale-1-5";
  minLabel: string;
  maxLabel: string;
  /** Reflection copy keyed by the selected level, "1" through "5". */
  reflections: Record<string, string>;
}

export interface SliderOption {
  value: string;
  label: string;
  sublabel: string;
}

export interface SegmentedSliderStep extends BaseStep {
  type: "segmented-slider";
  options: SliderOption[];
}

export type StepConfig =
  | TextStep
  | PhoneStep
  | PhotoCaptureStep
  | SingleSelectChipsStep
  | SingleSelectCardsStep
  | MultiSelectCardsStep
  | BodyMapStep
  | Scale1to5Step
  | SegmentedSliderStep;

export interface SectionConfig {
  id: string;
  label: string;
  steps: StepConfig[];
}

export type StepAnswerValue = string | string[];
export type SkinCheckAnswers = Record<string, StepAnswerValue>;
