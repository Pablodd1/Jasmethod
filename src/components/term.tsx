"use client";

// <Term k="ftp" /> — dotted-underline abbreviation with a plain-language tooltip.
// Definitions live in src/lib/glossary.ts (plain-language, bilingual).
import { gloss } from "@/lib/glossary";

export function Term({ k, lang, children }: { k: string; lang?: string; children?: React.ReactNode }) {
  const g = gloss(k, lang);
  return (
    <abbr title={g} className="underline decoration-dotted decoration-slate-400 underline-offset-2 cursor-help">
      {children || g.split("—")[0].trim()}
    </abbr>
  );
}
