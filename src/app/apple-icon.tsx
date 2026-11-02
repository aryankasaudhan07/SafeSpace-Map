import { ImageResponse } from "next/og";

// Home-screen icon for phones (Safari doesn't use SVG favicons): the logo on white.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        <svg width="128" height="128" viewBox="0 -2 40 40">
          <path d="M20 2 38 34H2Z" fill="#f39a32" stroke="#f39a32" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="20" cy="22" r="6" fill="none" stroke="#fff" strokeWidth="2.6" />
          <circle cx="20" cy="22" r="2" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
