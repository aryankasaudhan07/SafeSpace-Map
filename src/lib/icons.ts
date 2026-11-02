// Flat 2D icon set (24×24 glyphs), shared by React components and Leaflet's HTML markers.
// Each glyph is drawn in `fg` with optional details in `accent` (usually the badge colour).

export type IconName =
  | "police"
  | "metro"
  | "hospital"
  | "fuel"
  | "reports"
  | "pin"
  | "warning"
  | "sparkle"
  | "sos"
  | "phone"
  | "thumbsUp"
  | "flag";

const GLYPHS: Record<IconName, (fg: string, accent: string) => string> = {
  // Police: shield with a star
  police: (fg, accent) =>
    `<path d="M12 2.2 4.5 5v6.2c0 4.9 3.2 9 7.5 10.6 4.3-1.6 7.5-5.7 7.5-10.6V5L12 2.2Z" fill="${fg}"/>` +
    `<path d="m12 7.2 1.35 2.75 3.03.44-2.19 2.13.52 3.02L12 14.12l-2.71 1.42.52-3.02-2.19-2.13 3.03-.44L12 7.2Z" fill="${accent}"/>`,
  // Metro: bold "M"
  metro: (fg) => `<path d="M4.5 19V5h3.1L12 11.4 16.4 5h3.1v14h-3.2v-8.6L12 16.6l-4.3-6.2V19H4.5Z" fill="${fg}"/>`,
  // Hospital: medical cross
  hospital: (fg) => `<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6v-6Z" fill="${fg}"/>`,
  // Petrol pump
  fuel: (fg, accent) =>
    `<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h7A1.5 1.5 0 0 1 14 4.5V19H4V4.5Z" fill="${fg}"/>` +
    `<rect x="6" y="5.5" width="6" height="4.5" rx="1" fill="${accent}"/>` +
    `<path d="M3 19h12v2H3v-2Z" fill="${fg}"/>` +
    `<path d="M14 9h1.6a1.6 1.6 0 0 1 1.6 1.6v5.1a.8.8 0 0 0 1.6 0V8.6L16.7 6.5l1.2-1.2 2.4 2.4c.3.3.5.7.5 1.2v6.8a2.6 2.6 0 0 1-5.2 0v-4.7H14V9Z" fill="${fg}"/>`,
  // Reports: speech bubble with "!"
  reports: (fg, accent) =>
    `<path d="M3.5 6A2.5 2.5 0 0 1 6 3.5h12A2.5 2.5 0 0 1 20.5 6v9a2.5 2.5 0 0 1-2.5 2.5h-7.6L6 21v-3.5A2.5 2.5 0 0 1 3.5 15V6Z" fill="${fg}"/>` +
    `<rect x="10.9" y="6.5" width="2.2" height="5.6" rx="1.1" fill="${accent}"/><circle cx="12" cy="14.4" r="1.25" fill="${accent}"/>`,
  // Location pin
  pin: (fg, accent) =>
    `<path d="M12 2a7.5 7.5 0 0 0-7.5 7.5c0 5.4 7.5 12.5 7.5 12.5s7.5-7.1 7.5-12.5A7.5 7.5 0 0 0 12 2Z" fill="${fg}"/><circle cx="12" cy="9.5" r="2.8" fill="${accent}"/>`,
  // Warning triangle
  warning: (fg, accent) =>
    `<path d="M10.3 3.6a2 2 0 0 1 3.4 0l8 13.8a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3l8-13.8Z" fill="${fg}"/>` +
    `<rect x="10.9" y="8.5" width="2.2" height="5.8" rx="1.1" fill="${accent}"/><circle cx="12" cy="16.9" r="1.25" fill="${accent}"/>`,
  // AI sparkle
  sparkle: (fg) =>
    `<path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5Z" fill="${fg}"/>` +
    `<path d="M18.5 15c.25 2 1.25 3 3.25 3.25-2 .25-3 1.25-3.25 3.25-.25-2-1.25-3-3.25-3.25 2-.25 3-1.25 3.25-3.25Z" fill="${fg}"/>`,
  // SOS siren
  sos: (fg, accent) =>
    `<path d="M6 19v-6a6 6 0 1 1 12 0v6H6Z" fill="${fg}"/><path d="M4 19.5h16V22H4v-2.5Z" fill="${fg}"/>` +
    `<path d="M12 10.5a2.5 2.5 0 0 0-2.5 2.5v3h2v-3a.5.5 0 0 1 .5-.5V10.5Z" fill="${accent}"/>` +
    `<path d="M12 1.5v2.5M4.2 4.7l1.8 1.8M19.8 4.7 18 6.5" stroke="${fg}" stroke-width="2" stroke-linecap="round"/>`,
  // Phone handset
  phone: (fg) =>
    `<path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z" fill="${fg}"/>`,
  // Thumbs up (confirm)
  thumbsUp: (fg) =>
    `<path d="M2 10h3.5v11H2V10Zm5.5 11V10.2L12.6 3c.9-.4 2 .2 2.1 1.2l-.6 4.8h5.4a2 2 0 0 1 2 2.4l-1.6 7.8a2.2 2.2 0 0 1-2.2 1.8H7.5Z" fill="${fg}"/>`,
  // Flag (dispute / not accurate)
  flag: (fg) => `<path d="M5 2.5h2V22H5V2.5Zm3 1h10.5l-2.6 4.5 2.6 4.5H8v-9Z" fill="${fg}"/>`,
};

/** Full `<svg>` markup, for Leaflet HTML (popups / divIcons). */
export function iconSvg(name: IconName, { size = 16, fg = "currentColor", accent = "#fff" } = {}) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="display:block">${GLYPHS[name](fg, accent)}</svg>`;
}

/** Inner glyph markup, for the React `<Icon>` component. */
export function iconGlyph(name: IconName, fg: string, accent: string) {
  return GLYPHS[name](fg, accent);
}

/** Round coloured badge with a white glyph – the marker style used on the map. */
export function badgeHtml(name: IconName, color: string, size = 30) {
  const glyph = Math.round(size * 0.56);
  return `<div style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:999px;background:${color};border:2.5px solid #fff;box-shadow:0 4px 12px -2px rgba(15,23,42,.45)">${iconSvg(name, { size: glyph, fg: "#fff", accent: color })}</div>`;
}
