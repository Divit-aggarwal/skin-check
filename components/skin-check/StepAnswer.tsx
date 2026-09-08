"use client";

import type { SkinCheckAnswers, StepAnswerValue, StepConfig } from "@/types/skin-check";
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
  onScanChange: (scan: SkinScanState) => void;
  /** Whole-questionnaire context, needed by the final phone step to
      associate the finished session with the authenticated user. */
  answers: SkinCheckAnswers;
}

export function StepAnswer({ step, value, onChange, onCommit, scan, onScanChange, answers }: StepAnswerProps) {
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
        />
      );
    case "photo-capture":
      return (
        <PhotoCapture
          step={step}
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
