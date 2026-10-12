// TD-47: makes the web push key pair (VAPID, P-256) for the owner's release
// step, without printing the private key. Writes two files in the folder
// given (default: a new temp folder) and prints only that folder's path:
//   public.txt   NEXT_PUBLIC_VAPID_PUBLIC_KEY (not secret: the browser gets it)
//   private.txt  VAPID_PRIVATE_KEY (secret; file mode 600)
// docs/OWNER_QUEUE.md (H4) pipes each file into `vercel env add`, then deletes the folder.
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = process.argv[2] ?? mkdtempSync(join(tmpdir(), "vapid-"));
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const j = publicKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url")]).toString("base64url");
writeFileSync(join(dir, "public.txt"), pub);
writeFileSync(join(dir, "private.txt"), privateKey.export({ format: "jwk" }).d, { mode: 0o600 });
console.log(dir);
