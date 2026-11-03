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

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${outfit.variable} antialiased`}
      >
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
