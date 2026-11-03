import { ImageResponse } from "next/og";

// PNG app icons for the web manifest: the logo on white, inside the maskable safe zone.
const SIZES = new Set([192, 512]);

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const logo = Math.round(size * 0.6);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        <svg width={logo} height={logo} viewBox="0 -2 40 40">
          <path d="M20 2 38 34H2Z" fill="#f39a32" stroke="#f39a32" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="20" cy="22" r="6" fill="none" stroke="#fff" strokeWidth="2.6" />
          <circle cx="20" cy="22" r="2" fill="#fff" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
