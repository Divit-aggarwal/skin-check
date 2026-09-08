// Image-retention consent — the single source of truth for the version string
// and the policy URL, imported by the consent UI, the presign route, and the
// Firestore write so the three can never disagree (same discipline as
// lib/s3-key.ts's key builder).
//
// DISTINCT FROM the analysis-processing consent that already gates the scan
// (PhotoCapture's first checkbox). That one permits processing this image for
// this analysis; this one permits RETAINING the original in private S3. They
// are never combined into one boolean, in the UI or in the record.

/** Bump when the retention copy below changes. Persisted verbatim per scan. */
export const IMAGE_RETENTION_CONSENT_VERSION = "skin image retention version 1";

/** Exact approved copy for the retention checkbox. */
export const IMAGE_RETENTION_CONSENT_COPY =
  "I consent to Project SKIN securely retaining my skin image and associated skin-analysis data for the purposes of providing, maintaining, and improving my skin analysis experience. I understand that my image will be stored securely and handled according to the Project SKIN Privacy Policy.";

// A constant, not an env var, deliberately. The canonical Project SKIN privacy
// policy is a fixed public URL, and the one existing legal-URL env var
// (NEXT_PUBLIC_TERMS_URL) points at a DIFFERENT document and is unset in
// production today — which is exactly the silently-missing link this consent
// must never have.
export const PRIVACY_POLICY_URL = "https://theprojectskin.com/policies/privacy-policy";
export const PRIVACY_POLICY_LINK_TEXT = "Read our Privacy Policy";
