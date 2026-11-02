"use client";

import { useState } from "react";
import { copyText, nativeShare } from "@/lib/share";
import { REPORT_URL } from "@/lib/invite";

/** Share / copy the WhatsApp invite and print the poster. */
export default function InviteActions({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const text = message.replace(REPORT_URL, "").trim();
    if ((await nativeShare({ title: "SafeSpace Map", text, url: REPORT_URL })) === "unsupported") {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noreferrer");
    }
  }

  async function copy() {
    if (await copyText(message)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-3 rounded-[28px] bg-white p-5 print:hidden">
      <p className="text-sm font-semibold">WhatsApp message</p>
      <pre className="whitespace-pre-wrap rounded-2xl bg-soft p-4 font-sans text-sm leading-relaxed text-slate-700">{message}</pre>
      <div className="grid gap-2 sm:grid-cols-3">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-[#25d366] py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
        >
          Send on WhatsApp
        </a>
        <button onClick={share} className="rounded-full bg-[#111] py-2.5 text-sm font-medium text-white hover:bg-black">
          Share…
        </button>
        <button onClick={copy} className="rounded-full border border-slate-300 py-2.5 text-sm font-medium hover:bg-soft">
          {copied ? "Copied!" : "Copy message"}
        </button>
      </div>
      <button onClick={() => window.print()} className="w-full rounded-full bg-brand py-2.5 text-sm font-medium text-white hover:opacity-90">
        Print the poster (or save as PDF)
      </button>
    </div>
  );
}
