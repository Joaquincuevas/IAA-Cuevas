"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Botón "Sincronizar" compartido: ejecuta el callback de recarga de la página
 * y muestra el ícono girando mientras trabaja.
 */
export default function SyncButton({ onSync }: { onSync: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await onSync();
    } catch {
      // la página muestra su propio estado de error
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="flex items-center gap-2 px-3.5 py-2 border border-[#E5E7EB] rounded-lg text-[13px] text-[#4B5563] hover:bg-[#F9FAFB] transition-colors disabled:opacity-60 flex-shrink-0"
    >
      <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
      {busy ? "Sincronizando…" : "Sincronizar"}
    </button>
  );
}
