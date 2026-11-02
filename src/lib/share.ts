import type { LatLng } from "./types";

/** Google Maps link that opens the Maps app (or website) with a pin at this point. */
export function googleMapsLink(p: LatLng) {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/** Opens Google Maps centred on the point, where the user can start live location sharing. */
export function googleMapsOpenLink(p: LatLng) {
  return `https://www.google.com/maps/@?api=1&map_action=map&center=${p.lat.toFixed(6)},${p.lng.toFixed(6)}&zoom=17`;
}

export function locationMessage(p: LatLng) {
  const time = new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return {
    title: "My location",
    text: `I need help. This is my location at ${time}:`,
    url: googleMapsLink(p),
  };
}

/**
 * Opens the phone's own share menu (Quick Share, Messages, WhatsApp, Gmail…).
 * Returns "shared", "cancelled", or "unsupported" when the browser has no share menu (or refused it).
 */
export async function nativeShare(data: { title: string; text: string; url: string }): Promise<"shared" | "cancelled" | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.share) return "unsupported";
  if (navigator.canShare && !navigator.canShare(data)) return "unsupported";
  try {
    await navigator.share(data);
    return "shared";
  } catch (err) {
    return err instanceof DOMException && err.name === "AbortError" ? "cancelled" : "unsupported";
  }
}

/** Copies text; falls back to a hidden textarea where the Clipboard API isn't available (e.g. plain-http pages). */
export async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy method
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

/** Direct share links for the fallback sheet. */
export function shareTargets(data: { text: string; url: string }) {
  const full = `${data.text} ${data.url}`;
  const enc = encodeURIComponent;
  return {
    whatsapp: `https://wa.me/?text=${enc(full)}`,
    sms: `sms:?&body=${enc(full)}`,
    telegram: `https://t.me/share/url?url=${enc(data.url)}&text=${enc(data.text)}`,
    email: `mailto:?subject=${enc("My location")}&body=${enc(full)}`,
  };
}
