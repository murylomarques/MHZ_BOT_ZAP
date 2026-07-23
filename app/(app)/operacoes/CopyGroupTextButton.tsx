"use client";

import { useState } from "react";

export function CopyGroupTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard pode falhar em contexto não-seguro (http) — mostra o texto
      // pra copiar manualmente como fallback.
      window.prompt("Copie o texto abaixo (Ctrl+C):", text);
    }
  }

  return (
    <button
      onClick={onCopy}
      className="rounded-lg px-3 py-2 text-sm font-medium"
      style={{ background: copied ? "var(--success)" : "var(--brand)", color: "var(--brand-fg)" }}
    >
      {copied ? "Copiado!" : "Copiar para o grupo"}
    </button>
  );
}
