"use client";

import { createContext, useContext } from "react";

// While the site is a public demo, the desk passcode is shown on the control pages (see demoPasscode()).
const DemoPasscodeContext = createContext<string | null>(null);

export function DemoPasscodeProvider({ value, children }: { value: string | null; children: React.ReactNode }) {
  return <DemoPasscodeContext.Provider value={value}>{children}</DemoPasscodeContext.Provider>;
}

export const useDemoPasscode = () => useContext(DemoPasscodeContext);
