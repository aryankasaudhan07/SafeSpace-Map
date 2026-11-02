import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live location · SafeSpace Map",
  description: "Someone is sharing their live location with you on SafeSpace Map.",
  robots: { index: false, follow: false },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
