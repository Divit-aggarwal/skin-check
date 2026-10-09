"use client";

import type { SkinCheckAnswers, StepAnswerValue, StepConfig } from "@/types/skin-check";
import type { ProductNameKey, ProductNames } from "@/lib/skin-check-validation";
import type { SkinScanState } from "@/types/skin-scan";
import { TextInput } from "./inputs/TextInput";
import { PhoneAuthStep } from "./inputs/PhoneAuthStep";
import { PhotoCapture } from "./inputs/PhotoCapture";
import { ChipSelect } from "./inputs/ChipSelect";
import { CardSelect } from "./inputs/CardSelect";
import { ImageCardMultiSelect } from "./inputs/ImageCardMultiSelect";
import { BodyZoneChecklist } from "./inputs/BodyZoneChecklist";
import { ScaleSelect } from "./inputs/ScaleSelect";
import { SegmentedSlider } from "./inputs/SegmentedSlider";

interface StepAnswerProps {
  step: StepConfig;
  value: StepAnswerValue;
  onChange: (value: StepAnswerValue) => void;
  onCommit: () => void;
  scan: SkinScanState;
  onScanChange: (scan: SkinScanState, forScanId?: string) => void;
  /** Whole-questionnaire context, needed by the final phone step to
      associate the finished session with the authenticated user. */
  answers: SkinCheckAnswers;
  /** Stable id for this scan attempt — the final step writes under it. */
  scanId: string;
  /** Clears the local draft once the scan is safely persisted. */
  onSaved: (forScanId: string) => boolean;
  /** TD-33 (2): the product-name boxes' text, outside answers; saved by the final step. */
  productNames?: ProductNames | undefined;
  onProductNameChange?: ((key: ProductNameKey, text: string) => void) | undefined;
}

export function StepAnswer({
  step,
  value,
  onChange,
  onCommit,
  scan,
  onScanChange,
  answers,
  scanId,
  onSaved,
  productNames,
  onProductNameChange,
}: StepAnswerProps) {
  switch (step.type) {
    case "text":
      return <TextInput step={step} value={value as string} onChange={onChange} onCommit={onCommit} />;
    case "phone":
      return (
        <PhoneAuthStep
          step={step}
          value={value as string}
          onChange={onChange}
          onCommit={onCommit}
          answers={answers}
          scanId={scanId}
          scan={scan}
          onSaved={onSaved}
          productNames={productNames}
        />
      );
    case "photo-capture":
      return (
        <PhotoCapture
          step={step}
          scanId={scanId}
          value={value as string}
          onChange={onChange}
          onCommit={onCommit}
          scan={scan}
          onScanChange={onScanChange}
        />
      );
    case "single-select-chips":
      return <ChipSelect step={step} value={value as string} onChange={onChange} onCommit={onCommit} />;
    case "single-select-cards":
      return <CardSelect step={step} value={value as string} onChange={onChange} onCommit={onCommit} />;
    case "multi-select-cards":
      return (
        <ImageCardMultiSelect
          step={step}
          value={value as string[]}
          onChange={onChange}
          onCommit={onCommit}
          productNames={productNames}
          onProductNameChange={onProductNameChange}
        />
      );
    case "body-map":
      return (
        <BodyZoneChecklist step={step} value={value as string[]} onChange={onChange} onCommit={onCommit} />
      );
    case "scale-1-5":
      return <ScaleSelect step={step} value={value as string} onChange={onChange} onCommit={onCommit} />;
    case "segmented-slider":
      return (
        <SegmentedSlider step={step} value={value as string} onChange={onChange} onCommit={onCommit} />
      );
  }
}
