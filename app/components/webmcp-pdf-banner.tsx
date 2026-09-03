"use client";

import { useEffect, useState } from "react";
import { WEBMCP_PDF_EVENT } from "./webmcp-provider";

type PdfReady = { title: string; url: string };

/** Shows a dismissible download link whenever an agent calls export_resume_pdf, so a person watching the screen can grab the file. */
export function WebMcpPdfBanner() {
  const [item, setItem] = useState<PdfReady | null>(null);

  useEffect(() => {
    function onReady(e: Event) {
      setItem((e as CustomEvent<PdfReady>).detail);
    }
    window.addEventListener(WEBMCP_PDF_EVENT, onReady as EventListener);
    return () => window.removeEventListener(WEBMCP_PDF_EVENT, onReady as EventListener);
  }, []);

  if (!item) return null;

  return (
    <div className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-accent/30 bg-surface px-4 py-2.5 text-sm shadow-lg shadow-black/10">
      <span>
        Agent generated a PDF for <strong>{item.title}</strong>
      </span>
      <a
        href={item.url}
        download={`${item.title.replace(/\//g, "-")}.pdf`}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background hover:bg-accent-dark"
      >
        Download
      </a>
      <button
        type="button"
        onClick={() => setItem(null)}
        className="text-xs text-muted hover:text-foreground"
      >
        Dismiss
      </button>
    </div>
  );
}
