import { iconGlyph, type IconName } from "@/lib/icons";

/** Flat 2D icon. Glyph markup comes from the app's own constant icon set (no user input). */
export function Icon({ name, size = 16, color = "currentColor", accent = "#fff", className }: { name: IconName; size?: number; color?: string; accent?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: iconGlyph(name, color, accent) }}
    />
  );
}

/** Round coloured badge with a white glyph, matching the map markers. */
export function IconBadge({ name, color, size = 28 }: { name: IconName; color: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: color }} aria-hidden>
      <Icon name={name} size={Math.round(size * 0.56)} color="#fff" accent={color} />
    </span>
  );
}
