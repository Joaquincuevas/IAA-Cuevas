"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { getCoberturaHeatmap, getCoberturaCursos, type HeatmapData } from "@/lib/api";

const CARRERAS: { code: string; label: string }[] = [
  { code: "ICA", label: "ICA" },
  { code: "ICC", label: "ICC" },
  { code: "ICE", label: "ICE" },
  { code: "IOC", label: "IOC" },
  { code: "ICI", label: "ICI" },
];

const CARRERA_NOMBRES: Record<string, string> = {
  ICA: "Ing. Civil Ambiental",
  ICC: "Ing. Civil en Computación",
  ICE: "Ing. Civil Eléctrica",
  IOC: "Ing. Civil en Obras Civiles",
  ICI: "Ing. Civil Industrial",
};

// 0=blanco, 1-4 azules crecientes, 5+=oscuro
function countColor(n: number): string {
  if (n === 0) return "#FFFFFF";
  if (n === 1) return "#EFF6FF";
  if (n === 2) return "#BFDBFE";
  if (n === 3) return "#60A5FA";
  if (n === 4) return "#2563EB";
  return "#1B2A4A";
}

function dotColor(pct: number): string {
  if (pct >= 70) return "#10B981";
  if (pct >= 40) return "#F59E0B";
  return "#EF4444";
}

type SelectedCell = {
  competenciaId: number;
  semestre: number;
  textoCorto: string;
  textoCompleto: string;
  count: number;
};

type CoursePanelCurso = { codigo_curso: string; nombre_curso: string; semestre: number };

export default function CoberturaPage() {
  const [carrera, setCarrera] = useState("ICA");
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [panelCursos, setPanelCursos] = useState<CoursePanelCurso[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedCell(null);
    getCoberturaHeatmap(carrera)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [carrera]);

  useEffect(() => {
    if (!selectedCell) return;
    setPanelLoading(true);
    getCoberturaCursos(carrera, selectedCell.competenciaId)
      .then((res) => {
        // Filter to selected semestre
        setPanelCursos(
          res.cursos.filter((c) => c.semestre === selectedCell.semestre)
        );
      })
      .catch(console.error)
      .finally(() => setPanelLoading(false));
  }, [selectedCell, carrera]);

  const stats = data
    ? {
        cobertura: data.cobertura_global_pct,
        competencias: data.competencias.length,
        debiles: data.competencias_debiles.length,
        cursos: data.total_cursos,
      }
    : { cobertura: 0, competencias: 0, debiles: 0, cursos: 0 };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Cobertura curricular</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Cursos que tributan a cada competencia del{" "}
            <span className="text-[#1B2A4A]">Perfil de Egreso</span> por semestre.
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E7EB] rounded-md text-[12px] text-[#6B7280] hover:bg-[#F9FAFB] transition-colors">
          <Download size={13} /> PDF
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          label="COBERTURA GLOBAL"
          value={`${stats.cobertura}%`}
          sub="Promedio de semestres cubiertos por competencia"
          dc={dotColor(stats.cobertura)}
        />
        <StatCard
          label="PERFIL DE EGRESO"
          value={String(stats.competencias)}
          sub={`Competencias PE · ${CARRERA_NOMBRES[carrera]}`}
          dc="#6B7280"
        />
        <StatCard
          label="DOMINIOS DÉBILES"
          value={String(stats.debiles)}
          sub="Competencias con cobertura < 40%"
          dc="#F59E0B"
        />
        <StatCard
          label="CURSOS ANALIZADOS"
          value={String(stats.cursos)}
          sub="Cursos únicos en la matriz"
          dc="#6B7280"
        />
      </div>

      {/* Heatmap */}
      <div className="border border-[#E5E7EB] rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase">
            Mapa de calor · Perfil × Semestre
          </p>
          <div className="flex gap-1">
            {CARRERAS.map((c) => (
              <button
                key={c.code}
                onClick={() => setCarrera(c.code)}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  carrera === c.code
                    ? "bg-[#111827] text-white"
                    : "text-[#6B7280] hover:bg-[#F9FAFB]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center text-[#9CA3AF] text-[13px]">
            Cargando…
          </div>
        ) : (
          <div className="flex gap-4">
            {/* Table */}
            <div
              ref={tableRef}
              className="overflow-x-auto flex-1"
              onMouseLeave={() => setTooltip(null)}
            >
              <table className="w-full text-[11px]">
                <thead>
                  <tr>
                    <th className="text-left pr-4 pb-2 text-[10px] font-semibold text-[#6B7280] w-44" />
                    {data?.semestres.map((s) => (
                      <th
                        key={s}
                        className="text-center pb-2 text-[10px] font-semibold text-[#6B7280] w-10"
                      >
                        S{s}
                      </th>
                    ))}
                    <th className="text-right pb-2 text-[10px] font-semibold text-[#6B7280] w-12">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.competencias.map((comp, rowIdx) => {
                    const rowData = data.matriz[rowIdx];
                    const cubiertos = rowData.filter((v) => v > 0).length;
                    const pct = Math.round((cubiertos / 10) * 100);
                    return (
                      <tr key={comp.id}>
                        <td className="pr-3 py-1 w-44">
                          <div className="text-[10px] font-semibold text-[#6B7280]">
                            PE{comp.id}
                          </div>
                          <div
                            className="text-[11px] text-[#111827] leading-tight"
                            title={comp.texto_completo}
                          >
                            {comp.texto_corto}
                          </div>
                        </td>
                        {data.semestres.map((sem, colIdx) => {
                          const count = rowData[colIdx];
                          const isSelected =
                            selectedCell?.competenciaId === comp.id &&
                            selectedCell?.semestre === sem;
                          return (
                            <td key={sem} className="py-1 px-0.5">
                              <div
                                className={`h-8 w-full rounded-sm cursor-pointer transition-opacity ${
                                  isSelected ? "ring-2 ring-[#111827]" : ""
                                } ${count === 0 ? "opacity-40" : ""}`}
                                style={{ backgroundColor: countColor(count) }}
                                onClick={() => {
                                  if (count === 0) return;
                                  setSelectedCell({
                                    competenciaId: comp.id,
                                    semestre: sem,
                                    textoCorto: comp.texto_corto,
                                    textoCompleto: comp.texto_completo,
                                    count,
                                  });
                                }}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setTooltip({
                                    x: rect.left + rect.width / 2,
                                    y: rect.top - 8,
                                    text: `${comp.texto_corto} · S${sem}: ${count} curso${count !== 1 ? "s" : ""}`,
                                  });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                              />
                            </td>
                          );
                        })}
                        <td className="text-right py-1 pl-2">
                          <span className="text-[11px] font-medium flex items-center justify-end gap-1">
                            <span style={{ color: dotColor(pct) }}>●</span> {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Side panel */}
            {selectedCell && (
              <div className="w-64 shrink-0 border border-[#E5E7EB] rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide">
                      PE{selectedCell.competenciaId} · S{selectedCell.semestre}
                    </p>
                    <p
                      className="text-[11px] text-[#111827] mt-0.5 leading-snug"
                      title={selectedCell.textoCompleto}
                    >
                      {selectedCell.textoCorto}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCell(null)}
                    className="text-[#9CA3AF] hover:text-[#6B7280] ml-2 shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
                <p className="text-[10px] text-[#6B7280] mb-2">
                  {selectedCell.count} curso{selectedCell.count !== 1 ? "s" : ""} en este semestre
                </p>
                {panelLoading ? (
                  <p className="text-[11px] text-[#9CA3AF]">Cargando…</p>
                ) : panelCursos.length === 0 ? (
                  <p className="text-[11px] text-[#9CA3AF]">Sin cursos.</p>
                ) : (
                  <ul className="space-y-2">
                    {panelCursos.map((c) => (
                      <li key={c.codigo_curso} className="border border-[#F3F4F6] rounded-lg p-2">
                        <p className="text-[10px] font-semibold text-[#1B2A4A]">{c.codigo_curso}</p>
                        <p className="text-[11px] text-[#374151] leading-tight">{c.nombre_curso}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-3 mt-4">
          <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
            N.º de cursos
          </span>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded-sm border border-[#E5E7EB]"
                style={{ backgroundColor: countColor(n) }}
              />
              <span className="text-[10px] text-[#6B7280]">{n === 0 ? "N/A" : n === 5 ? "5+" : String(n)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weak competencias */}
      {data && data.competencias_debiles.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase mb-3">
            Competencias con cobertura débil (&lt;40%)
          </p>
          <div className="grid grid-cols-2 gap-3">
            {data.competencias_debiles.map((c) => (
              <div key={c.id} className="border border-[#FEF3C7] bg-[#FFFBEB] rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-[#92400E]">PE{c.id}</p>
                    <p className="text-[12px] text-[#111827] mt-0.5" title={c.texto_corto}>
                      {c.texto_corto}
                    </p>
                  </div>
                  <p className="text-[22px] font-bold text-[#D97706] ml-4">{c.pct}%</p>
                </div>
                <div className="mt-2 h-1 bg-[#FDE68A] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#F59E0B] rounded-full"
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tooltip portal-style (fixed) */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-2 py-1 bg-[#111827] text-white text-[10px] rounded shadow-lg max-w-[240px] text-center leading-tight"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translateX(-50%) translateY(-100%)",
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  dc,
}: {
  label: string;
  value: string;
  sub: string;
  dc: string;
}) {
  return (
    <div className="border border-[#E5E7EB] rounded-xl p-4">
      <p className="text-[9px] font-semibold tracking-widest text-[#6B7280] uppercase mb-1">
        {label}
      </p>
      <p className="text-[28px] font-bold text-[#111827] leading-none mb-1">{value}</p>
      <p className="text-[11px] text-[#6B7280] flex items-center gap-1">
        <span style={{ color: dc }}>●</span> {sub}
      </p>
    </div>
  );
}
