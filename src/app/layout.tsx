import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SafeSpace Map",
  description: "Anonymous, AI-triaged safety reports and heatmap for women in Delhi",
  appleWebApp: { capable: true, title: "SafeSpace", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

// Runs before the first paint: the saved choice, else the phone / computer setting (no white flash in dark mode).
const THEME_SCRIPT = `try{var t=localStorage.getItem("safespace-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body
        className={`${outfit.variable} antialiased`}
      >
        {children}
        {/* Installed app only (see .launch-screen): the phone's own splash shows just the icon, so this follows it with the name. */}
        <div className="launch-screen keep-light" aria-hidden>
          <svg viewBox="0 0 40 36" className="h-[86px] w-24">
            <path d="M20 2 38 34H2Z" fill="#f39a32" stroke="#f39a32" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="20" cy="22" r="6" fill="none" stroke="#fff" strokeWidth="2.4" />
            <circle cx="20" cy="22" r="2" fill="#fff" />
          </svg>
          <p className="mt-5 text-[30px] tracking-tight text-[#111]">
            SafeSpace <span className="font-bold">Map</span>
          </p>
        </div>
        <ServiceWorker />
      </body>
    </html>
  );
}
