"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown, Filter, Layers } from "lucide-react";

export type ExportScope = "filtered" | "all";

/**
 * Botón "Exportar CSV" con menú: exportar la vista actual (respetando los
 * filtros activos) o todas las propuestas de la carrera seleccionada.
 */
export default function ExportCsvButton({
  onExport,
  filteredLabel,
  allLabel,
  filteredCount,
}: {
  onExport: (scope: ExportScope) => Promise<void>;
  filteredLabel?: string;
  allLabel?: string;
  filteredCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function run(scope: ExportScope) {
    if (busyRef.current) return;
    busyRef.current = true;
    setOpen(false);
    setBusy(true);
    try {
      await onExport(scope);
    } catch {
      // silencioso: la página puede mostrar su propio error
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const itemCls =
    "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-[#374151] hover:bg-[#F9FAFB] transition-colors";

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex items-center gap-2 px-3.5 py-2 border border-[#E5E7EB] rounded-lg text-[13px] text-[#4B5563] hover:bg-[#F9FAFB] transition-colors disabled:opacity-60"
      >
        <Download size={14} />
        {busy ? "Exportando…" : "Exportar CSV"}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-64 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-40 py-1 overflow-hidden">
          <button type="button" onClick={() => run("filtered")} className={itemCls}>
            <Filter size={14} className="text-[#1B2A4A] flex-shrink-0" />
            <span>
              {filteredLabel ?? "Vista actual (con filtros)"}
              {typeof filteredCount === "number" && (
                <span className="text-[#9CA3AF]"> · {filteredCount}</span>
              )}
            </span>
          </button>
          <button type="button" onClick={() => run("all")} className={itemCls}>
            <Layers size={14} className="text-[#1B2A4A] flex-shrink-0" />
            <span>{allLabel ?? "Todo (sin filtros)"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
