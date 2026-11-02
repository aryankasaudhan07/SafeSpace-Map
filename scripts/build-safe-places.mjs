// Converts an Overpass API export into the compact src/data/safe-places.json bundled with the app.
// Usage: node scripts/build-safe-places.mjs overpass-export.json
import { readFileSync, writeFileSync } from "fs";

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));

function kindOf(tags) {
  if (tags.amenity === "police") return "police";
  if (tags.amenity === "hospital") return "hospital";
  if (tags.station === "subway") return "metro";
  if (tags.amenity === "fuel") return "fuel";
  return null;
}

const seen = new Set();
const places = [];
for (const el of input.elements) {
  const tags = el.tags ?? {};
  const kind = kindOf(tags);
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!kind || lat == null || lng == null) continue;

  const name = tags["name:en"] || tags.name || tags.brand || null;
  // OSM tags police-run prepaid auto/taxi booths as police; they are not places to seek help.
  if (kind === "police" && name && /prepaid|facilitation|taxi|auto service/i.test(name)) continue;
  // Unnamed police posts / hospitals are still useful; unnamed metro or fuel entries are usually duplicates.
  if (!name && (kind === "metro" || kind === "fuel")) continue;

  const key = `${kind}:${(name ?? "").toLowerCase()}:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  if (seen.has(key)) continue;
  seen.add(key);

  places.push({
    id: `${el.type[0]}${el.id}`,
    kind,
    name: name ?? (kind === "police" ? "Police station / post" : "Hospital"),
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    ...((tags.phone || tags["contact:phone"]) && { phone: (tags.phone || tags["contact:phone"]).split(";")[0].trim() }),
    ...(tags.opening_hours === "24/7" && { open24: true }),
  });
}

writeFileSync(new URL("../src/data/safe-places.json", import.meta.url), JSON.stringify(places));
const counts = places.reduce((c, p) => ((c[p.kind] = (c[p.kind] ?? 0) + 1), c), {});
console.log(`Wrote ${places.length} places`, counts);
