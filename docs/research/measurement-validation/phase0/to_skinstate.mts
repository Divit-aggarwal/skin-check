// Map every bench /scan response through the frozen skinstate-1 view (DATA_SPEC §5).
// Run from the repo root:  npx vite-node docs/research/measurement-validation/phase0/to_skinstate.mts
// The record wrapper mirrors the gate-01 scanAnalyses shape; identity fields are bench placeholders.
import { readFileSync, writeFileSync } from "node:fs";
import { toSkinState } from "../../../../lib/skin-state";
import { scanAnalysisDocId } from "../../../../lib/scan-analysis-record";

const dir = "docs/research/measurement-validation/phase0/results";
const { rows } = JSON.parse(readFileSync(`${dir}/matrix.json`, "utf8"));
const out = rows.map((r: any) => {
  const { overlays: _o, ...resp } = r.response;
  const record = {
    schemaVersion: 1, source: "server", scanId: `bench-${r.variant}`, requestId: "bench",
    inputSha256: r.transmittedSha256, captureMethod: "native", createdAt: "2026-10-03T00:00:00.000Z",
    ...resp,
  };
  const s = toSkinState(record, `users/bench/scanAnalyses/${scanAnalysisDocId(record.scanId, record.inputSha256)}`, "bench");
  if (s.kind !== "skinstate") throw new Error(`${r.variant}: ${JSON.stringify(s)}`);
  return { variant: r.variant, skinState: s.state };
});
writeFileSync(`${dir}/skinstates.json`, JSON.stringify(out, null, 1));
console.log(`mapped ${out.length} responses; all kind=skinstate`);
