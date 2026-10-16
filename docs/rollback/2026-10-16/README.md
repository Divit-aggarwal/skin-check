# Rollback, 2026-10-16 (G37 rules deploy and S3 IAM)

These are the live versions from just before the owner-approved changes of 2026-10-16 (TD-56, G38). The account ID has been removed from the IAM files; the bucket ARN is real.

**Firestore rules** (project projectskin-a202c):
```
cp docs/rollback/2026-10-16/firestore.rules.before firestore.rules
npx -y firebase-tools@latest deploy --only firestore:rules --project projectskin-a202c
```

**S3 IAM** (each restores the single `original.jpg` resource):
```
aws iam put-user-policy --user-name skin-check-uploader --policy-name skin-check-put-originals \
  --policy-document file://docs/rollback/2026-10-16/iam-skin-check-uploader.skin-check-put-originals.before.json
aws iam put-user-policy --user-name skin-check-photo-reader --policy-name skin-check-read-kept-originals \
  --policy-document file://docs/rollback/2026-10-16/iam-skin-check-photo-reader.skin-check-read-kept-originals.before.json
```

Roll back IAM only with the three-angle flag off: after the rollback, side photos can no longer be uploaded or read.
