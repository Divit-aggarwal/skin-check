# H01: S3 originals erasure readiness (read-only check)

Status: **FINDINGS ONLY.** Nothing was changed. The erasure IAM below is a proposal for the owner (D-17).

Checked 2026-10-03 as `arn:aws:iam::550428926515:user/theagihustler@gmail.com` (the local CLI profile, not app credentials). Region ap-south-1.

## Evidence

| Command (`aws s3api … --bucket projectskin-skin-originals-prod`) | Result |
|---|---|
| `get-bucket-versioning` | Empty response: versioning **never enabled** |
| `get-object-lock-configuration` | `ObjectLockConfigurationNotFoundError`: **no Object Lock** |
| `get-bucket-lifecycle-configuration` | `NoSuchLifecycleConfiguration`: **no lifecycle**, so originals are kept indefinitely |
| `get-public-access-block` | All four blocks `true` |
| `get-bucket-encryption` | SSE-S3 (AES256), bucket key on, SSE-C blocked |
| `get-bucket-location` | `ap-south-1` |
| `get-bucket-ownership-controls` | `BucketOwnerEnforced` (ACLs disabled) |
| `get-bucket-policy` | `NoSuchBucketPolicy` |
| `aws iam get-user-policy --user-name skin-check-uploader` | Only inline policy `skin-check-put-originals`: `s3:PutObject` on `…/users/*/scans/*/original.jpg`; no attached policies |

## What this means for D-17

- **Unblocked:** neither Object Lock nor versioning is enabled, so `DeleteObject` is a permanent delete. No version purge or legal-hold handling is needed today.
- **Still blocked:** IAM. The only app principal can put objects, not list or delete them. The erasure route needs, scoped to one user's prefix:
  - `s3:ListBucket` on the bucket, with condition `s3:prefix` = `users/${uid}/*`. In practice the route enforces the uid, and the policy restricts to `users/*`.
  - `s3:DeleteObject` on `arn:aws:s3:::projectskin-skin-originals-prod/users/*`.
  - **Recommendation:** use a separate principal (or a separate key pair) for erasure rather than widening the uploader, so that a leak of the upload key cannot delete data.
- **Ordering caveat:** if versioning is ever enabled later, erasure must also grant `s3:DeleteObjectVersion` and delete every version. Re-check before H01 ships.
- **Retention gap:** without a lifecycle rule, originals are retained forever. This needs a retention decision (D-16 retention consent) and is not decided here.
- **Not in Terraform:** the bucket and the uploader user are CLI-created drift (see PRODUCTION_BASELINE / deploy notes). Any IAM change is an OWNER ACTION and should be recorded.

## Not established

This check covers bucket configuration only. It does not verify object contents, other buckets, or CloudTrail, and it does not test that a delete works. No objects were listed or read.
