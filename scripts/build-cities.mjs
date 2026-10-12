// Builds lib/home/cities.json from GeoNames (CC BY 4.0, https://www.geonames.org/).
// Download cities15000.zip (unzip it), admin1CodesASCII.txt and countryInfo.txt
// from https://download.geonames.org/export/dump/ into one folder, then:
//   node scripts/build-cities.mjs <folder>
// Kept: every Indian town of 15,000 people or more (India first), and every
// other city of 100,000 or more. Each row: [name, region, country, lat, lon],
// coordinates in hundredths of a degree.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const rows = (f) => readFileSync(join(dir, f), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));
const admin1 = new Map(rows("admin1CodesASCII.txt").map((r) => [r[0], r[1]]));
const country = new Map(rows("countryInfo.txt").map((r) => [r[0], r[4]]));
const out = rows("cities15000.txt")
  .filter((r) => r[8] === "IN" || Number(r[14]) >= 100000)
  .sort((a, b) => Number(b[14]) - Number(a[14]))
  .map((r) => [r[1], admin1.get(`${r[8]}.${r[10]}`) ?? "", country.get(r[8]) ?? r[8], Math.round(Number(r[4]) * 100), Math.round(Number(r[5]) * 100)]);
writeFileSync("lib/home/cities.json", JSON.stringify(out));
console.log(`${out.length} places`);
