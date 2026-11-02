import type { Category, Report, TimeOfDay } from "./types";

// Sample reports around Delhi so the map is meaningful in demos.
// Always flagged `demo: true` and shown with a "Demo data" badge in the UI.

const HOTSPOTS: { name: string; lat: number; lng: number; weight: number; night: number }[] = [
  { name: "Kashmere Gate ISBT", lat: 28.6675, lng: 77.2282, weight: 7, night: 0.7 },
  { name: "Anand Vihar ISBT", lat: 28.6469, lng: 77.316, weight: 6, night: 0.7 },
  { name: "Sarai Kale Khan", lat: 28.589, lng: 77.256, weight: 5, night: 0.8 },
  { name: "Chandni Chowk", lat: 28.6506, lng: 77.2303, weight: 5, night: 0.3 },
  { name: "Rajiv Chowk metro", lat: 28.6328, lng: 77.2197, weight: 4, night: 0.4 },
  { name: "Lajpat Nagar market", lat: 28.5677, lng: 77.2433, weight: 4, night: 0.4 },
  { name: "Munirka", lat: 28.558, lng: 77.172, weight: 4, night: 0.8 },
  { name: "Dhaula Kuan", lat: 28.5918, lng: 77.1617, weight: 3, night: 0.9 },
  { name: "Nehru Place", lat: 28.5494, lng: 77.2511, weight: 3, night: 0.6 },
  { name: "Karol Bagh", lat: 28.6519, lng: 77.1909, weight: 3, night: 0.4 },
  { name: "Laxmi Nagar", lat: 28.6304, lng: 77.2773, weight: 3, night: 0.5 },
  { name: "Okhla Industrial Area", lat: 28.5355, lng: 77.272, weight: 3, night: 0.9 },
  { name: "Mukherjee Nagar", lat: 28.7068, lng: 77.2079, weight: 2, night: 0.5 },
  { name: "Dwarka Mor", lat: 28.6195, lng: 77.033, weight: 2, night: 0.7 },
  { name: "Hauz Khas Village", lat: 28.5535, lng: 77.194, weight: 2, night: 0.8 },
  { name: "Rohini Sector 18", lat: 28.738, lng: 77.136, weight: 2, night: 0.6 },
];

const TEMPLATES: { category: Category; severity: number; title: string; text: string }[] = [
  { category: "verbal_harassment", severity: 3, title: "Catcalling near", text: "Group of men passing comments near the exit, kept making remarks as I walked past." },
  { category: "verbal_harassment", severity: 3, title: "Lewd comments at auto stand near", text: "Auto drivers waiting at the stand making lewd comments at women walking by." },
  { category: "verbal_harassment", severity: 2, title: "Whistling and remarks near", text: "Boys on bikes whistling and shouting remarks after the shops closed." },
  { category: "stalking", severity: 4, title: "Followed from metro gate near", text: "A man followed me from the metro gate to the bus stop and kept standing close until my bus came." },
  { category: "stalking", severity: 4, title: "Followed by bike rider near", text: "Same person on a bike followed me through two lanes, left only when I went into a shop." },
  { category: "physical_harassment", severity: 5, title: "Groping while boarding bus near", text: "Groped in the crowd while boarding the bus. Very crowded at the boarding point, no marshal around." },
  { category: "physical_harassment", severity: 4, title: "Deliberate pushing on foot bridge near", text: "Someone deliberately pushed against me on the crowded foot-over bridge and disappeared." },
  { category: "poor_lighting", severity: 2, title: "Broken streetlights near", text: "Streetlights not working on the stretch to the colony gate, completely dark after 8pm." },
  { category: "poor_lighting", severity: 2, title: "Dark underpass near", text: "Underpass has no working lights. People avoid it after dark but it is the shortest way." },
  { category: "unsafe_transport", severity: 4, title: "Cab driver changed route near", text: "Cab driver took an unknown route and switched off GPS, I asked him to stop on the main road." },
  { category: "unsafe_transport", severity: 3, title: "Unlit bus stop with loiterers near", text: "Bus stop has no shelter or lighting, buses are irregular at night and men loiter around." },
  { category: "isolated_area", severity: 3, title: "Deserted service lane near", text: "Service lane is deserted after evening, no shops or guards, felt unsafe walking alone." },
  { category: "isolated_area", severity: 3, title: "Empty park entrance at night near", text: "Park entrance is empty at night and people drink inside, avoid walking through." },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build(): Report[] {
  const rand = mulberry32(2026);
  const base = Date.UTC(2026, 9, 31);
  const reports: Report[] = [];
  let i = 0;
  for (const spot of HOTSPOTS) {
    for (let n = 0; n < spot.weight * 2; n++) {
      const t = TEMPLATES[Math.floor(rand() * TEMPLATES.length)];
      const roll = rand();
      const timeOfDay: TimeOfDay =
        roll < spot.night * 0.6 ? "night" : roll < spot.night ? "evening" : roll < spot.night + (1 - spot.night) / 2 ? "afternoon" : "morning";
      reports.push({
        id: `demo-${i++}`,
        createdAt: new Date(base - Math.floor(rand() * 75) * 86400000).toISOString(),
        // ~ up to 700 m of jitter around the hotspot
        lat: spot.lat + (rand() - 0.5) * 0.012,
        lng: spot.lng + (rand() - 0.5) * 0.014,
        category: t.category,
        severity: Math.min(5, Math.max(1, t.severity + (rand() < 0.2 ? -1 : 0))),
        title: `${t.title} ${spot.name}`,
        description: t.text,
        timeOfDay,
        demo: true,
        confirms: Math.floor(rand() * rand() * 7),
        disputes: rand() < 0.1 ? 1 : 0,
      });
    }
  }
  return reports;
}

export const DEMO_REPORTS = build();
