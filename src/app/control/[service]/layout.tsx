import type { Metadata } from "next";
import { DemoPasscodeProvider } from "@/components/DemoPasscode";
import { demoPasscode } from "@/lib/control-auth";

export const metadata: Metadata = {
  title: "Control room (demo) · SafeSpace Map",
  robots: { index: false, follow: false },
};

export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return <DemoPasscodeProvider value={demoPasscode()}>{children}</DemoPasscodeProvider>;
}
