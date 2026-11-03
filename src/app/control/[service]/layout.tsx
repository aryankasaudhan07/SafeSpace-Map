import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Control room (demo) · SafeSpace Map",
  robots: { index: false, follow: false },
};

export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return children;
}
