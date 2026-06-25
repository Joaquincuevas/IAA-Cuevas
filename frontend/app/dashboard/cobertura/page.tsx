"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Search, X } from "lucide-react";
import {
  getCoberturaHeatmap,
  getCoberturaCursos,
  getCoberturaTributaciones,
  type HeatmapData,
  type TributacionCompetencia,
} from "@/lib/api";

const CARRERAS = [
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

type RowTooltip = { x: number; y: number; text: string };

export default function CoberturaPage() {
  const [carrera, setCarrera] = useState("ICA");
  const [activeView, setActiveView] = useState<"heatmap" | "detalle">("heatmap");

  // Heatmap state
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);

  // Side panel (cell click)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [panelCursos, setPanelCursos] = useState<CoursePanelCurso[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  // Row tooltip (competencia full text on hover)
  const [rowTooltip, setRowTooltip] = useState<RowTooltip | null>(null);

  // Detail view state
  const [tributaciones, setTributaciones] = useState<TributacionCompetencia[] | null>(null);
  const [tribLoading, setTribLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Fetch heatmap when carrera changes
  useEffect(() => {
    setLoading(true);
    setSelectedCell(null);
    getCoberturaHeatmap(carrera)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [carrera]);

  // Fetch tributaciones when switching to detail tab or carrera changes
  useEffect(() => {
    if (activeView !== "detalle") return;
    setTribLoading(true);
    setTributaciones(null);
    setExpanded(new Set());
    setSearch("");
    getCoberturaTributaciones(carrera)
      .then((res) => setTributaciones(res.competencias))
      .catch(console.error)
      .finally(() => setTribLoading(false));
  }, [activeView, carrera]);

  // Fetch courses when a cell is selected
  useEffect(() => {
    if (!selectedCell) return;
    setPanelLoading(true);
    getCoberturaCursos(carrera, selectedCell.competenciaId)
      .then((res) =>
        setPanelCursos(res.cursos.filter((c) => c.semestre === selectedCell.semestre))
      )
      .catch(console.error)
      .finally(() => setPanelLoading(false));
  }, [selectedCell, carrera]);

  // Auto-expand competencias that match via courses when searching
  useEffect(() => {
    if (!search || !tributaciones) {
      setExpanded(new Set());
      return;
    }
    const q = search.toLowerCase();
    const toExpand = new Set<number>();
    tributaciones.forEach((comp) => {
      const nameMatch = comp.texto_corto.toLowerCase().includes(q);
      const courseMatch = comp.cursos.some(
        (c) =>
          c.nombre_curso.toLowerCase().includes(q) ||
          c.codigo_curso.toLowerCase().includes(q)
      );
      if (courseMatch && !nameMatch) toExpand.add(comp.competencia_id);
    });
    setExpanded(toExpand);
  }, [search, tributaciones]);

  const stats = data
    ? {
        cobertura: data.cobertura_global_pct,
        competencias: data.competencias.length,
        debiles: data.competencias_debiles.length,
        cursos: data.total_cursos,
      }
    : { cobertura: 0, competencias: 0, debiles: 0, cursos: 0 };

  const filteredComps = tributaciones?.filter((comp) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const nameMatch = comp.texto_corto.toLowerCase().includes(q);
    const courseMatch = comp.cursos.some(
      (c) =>
        c.nombre_curso.toLowerCase().includes(q) ||
        c.codigo_curso.toLowerCase().includes(q)
    );
    return nameMatch || courseMatch;
  }) ?? [];

  return (
    <div className="p-8" onMouseLeave={() => setRowTooltip(null)}>
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

      {/* Carrera selector */}
      <div className="flex gap-1 mb-5">
        {CARRERAS.map((c) => (
          <button
            key={c.code}
            onClick={() => { setCarrera(c.code); setActiveView("heatmap"); }}
            className={`px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              carrera === c.code
                ? "bg-[#111827] text-white"
                : "text-[#6B7280] border border-[#E5E7EB] hover:bg-[#F9FAFB]"
            }`}
          >
            {c.code}
          </button>
        ))}
        <span className="ml-2 self-center text-[12px] text-[#9CA3AF]">
          {CARRERA_NOMBRES[carrera]}
        </span>
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
          sub="Competencias PE en la carrera"
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

      {/* View tab switcher */}
      <div className="flex gap-0 mb-4 border-b border-[#E5E7EB]">
        {(["heatmap", "detalle"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
              activeView === v
                ? "border-[#111827] text-[#111827]"
                : "border-transparent text-[#6B7280] hover:text-[#374151]"
            }`}
          >
            {v === "heatmap" ? "Mapa de calor" : "Detalle por Competencia"}
          </button>
        ))}
      </div>

      {/* ── HEATMAP VIEW ── */}
      {activeView === "heatmap" && (
        <div className="border border-[#E5E7EB] rounded-xl p-6 mb-6">
          <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase mb-4">
            Mapa de calor · Perfil × Semestre
          </p>

          {loading ? (
            <div className="h-40 flex items-center justify-center text-[#9CA3AF] text-[13px]">
              Cargando…
            </div>
          ) : (
            <div className="flex gap-4">
              {/* Table */}
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr>
                      <th className="text-left pr-4 pb-2 text-[10px] font-semibold text-[#6B7280] w-48" />
                      {data?.semestres.map((s) => (
                        <th
                          key={s}
                          className="text-center pb-2 text-[10px] font-semibold text-[#6B7280] w-9"
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
                      const pct = Math.round((cubiertos / data.semestres.length) * 100);
                      return (
                        <tr
                          key={comp.id}
                          className="group"
                          onMouseMove={(e) =>
                            setRowTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              text: comp.texto_completo,
                            })
                          }
                          onMouseLeave={() => setRowTooltip(null)}
                        >
                          <td className="pr-3 py-1 w-48 cursor-default">
                            <div className="text-[10px] font-semibold text-[#6B7280]">
                              PE{comp.id}
                            </div>
                            <div className="text-[13px] text-[#111827] leading-tight">
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
                                  className={`h-8 w-full rounded-sm transition-opacity ${
                                    count > 0
                                      ? "cursor-pointer hover:opacity-80"
                                      : "cursor-default"
                                  } ${isSelected ? "ring-2 ring-[#111827]" : ""}`}
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

              {/* Side panel (cell click) */}
              {selectedCell && (
                <div className="w-60 shrink-0 border border-[#E5E7EB] rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide">
                        PE{selectedCell.competenciaId} · S{selectedCell.semestre}
                      </p>
                      <p className="text-[11px] text-[#111827] mt-0.5 leading-snug">
                        {selectedCell.textoCorto}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedCell(null)}
                      className="text-[#9CA3AF] hover:text-[#6B7280] ml-2 shrink-0 mt-0.5"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <p className="text-[10px] text-[#6B7280] mb-2">
                    {selectedCell.count} curso{selectedCell.count !== 1 ? "s" : ""} en S
                    {selectedCell.semestre}
                  </p>
                  {panelLoading ? (
                    <p className="text-[11px] text-[#9CA3AF]">Cargando…</p>
                  ) : panelCursos.length === 0 ? (
                    <p className="text-[11px] text-[#9CA3AF]">Sin cursos.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {panelCursos.map((c) => (
                        <li
                          key={c.codigo_curso}
                          className="border border-[#F3F4F6] rounded-lg p-2"
                        >
                          <p className="text-[10px] font-semibold text-[#1B2A4A]">
                            {c.codigo_curso}
                          </p>
                          <p className="text-[11px] text-[#374151] leading-tight">
                            {c.nombre_curso}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          {!loading && (
            <div className="flex items-center gap-3 mt-4">
              <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                N.º cursos
              </span>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="flex items-center gap-1">
                  <div
                    className="w-4 h-4 rounded-sm border border-[#E5E7EB]"
                    style={{ backgroundColor: countColor(n) }}
                  />
                  <span className="text-[10px] text-[#6B7280]">
                    {n === 0 ? "N/A" : n === 5 ? "5+" : String(n)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DETAIL VIEW ── */}
      {activeView === "detalle" && (
        <div className="border border-[#E5E7EB] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase">
              Detalle por Competencia PE
            </p>
            <div className="relative w-64">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
              />
              <input
                type="text"
                placeholder="Buscar competencia o curso…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-[#E5E7EB] rounded-lg text-[12px] text-[#374151] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-1 focus:ring-[#1B2A4A]"
              />
            </div>
          </div>

          {tribLoading ? (
            <div className="h-32 flex items-center justify-center text-[#9CA3AF] text-[13px]">
              Cargando…
            </div>
          ) : filteredComps.length === 0 ? (
            <p className="text-[13px] text-[#9CA3AF] py-8 text-center">
              {search ? "Sin resultados para esa búsqueda." : "Sin datos."}
            </p>
          ) : (
            <div className="divide-y divide-[#F3F4F6]">
              {filteredComps.map((comp) => {
                const isExpanded = expanded.has(comp.competencia_id);
                const q = search.toLowerCase();
                const filteredCursos = search
                  ? comp.cursos.filter(
                      (c) =>
                        c.nombre_curso.toLowerCase().includes(q) ||
                        c.codigo_curso.toLowerCase().includes(q)
                    )
                  : comp.cursos;

                return (
                  <div key={comp.competencia_id}>
                    {/* Competencia header row */}
                    <button
                      className="w-full flex items-center gap-3 py-3 px-2 text-left hover:bg-[#F9FAFB] transition-colors rounded-lg"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(comp.competencia_id)) next.delete(comp.competencia_id);
                          else next.add(comp.competencia_id);
                          return next;
                        })
                      }
                    >
                      <span className="text-[#9CA3AF] shrink-0">
                        {isExpanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </span>
                      <span className="text-[11px] font-semibold text-[#1B2A4A] w-10 shrink-0">
                        PE{comp.competencia_id}
                      </span>
                      <span className="text-[13px] text-[#111827] flex-1 leading-tight">
                        {comp.texto_corto}
                      </span>
                      <span className="text-[11px] text-[#6B7280] shrink-0 ml-2">
                        {comp.cursos.length} cursos
                      </span>
                    </button>

                    {/* Expanded course table */}
                    {isExpanded && (
                      <div className="ml-10 mb-3">
                        {/* Full competencia text */}
                        <p className="text-[11px] text-[#6B7280] italic mb-2 pr-4 leading-snug">
                          {comp.texto_completo}
                        </p>
                        {filteredCursos.length === 0 ? (
                          <p className="text-[12px] text-[#9CA3AF] py-2">
                            {search ? "Sin cursos que coincidan con la búsqueda." : "Sin cursos."}
                          </p>
                        ) : (
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide">
                                <th className="text-left pb-1 w-16">Semestre</th>
                                <th className="text-left pb-1 w-28">Código</th>
                                <th className="text-left pb-1">Nombre curso</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F9FAFB]">
                              {filteredCursos.map((c) => (
                                <tr
                                  key={c.codigo_curso + c.semestre}
                                  className="hover:bg-[#F9FAFB]"
                                >
                                  <td className="py-1.5 pr-2">
                                    <span className="inline-flex items-center justify-center w-8 h-5 bg-[#F3F4F6] rounded text-[10px] font-semibold text-[#374151]">
                                      S{c.semestre}
                                    </span>
                                  </td>
                                  <td className="py-1.5 pr-3 font-mono text-[11px] font-semibold text-[#1B2A4A]">
                                    {c.codigo_curso}
                                  </td>
                                  <td className="py-1.5 text-[#374151]">{c.nombre_curso}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Weak competencias (heatmap view only) */}
      {activeView === "heatmap" && data && data.competencias_debiles.length > 0 && (
        <div className="mt-6">
          <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase mb-3">
            Competencias con cobertura débil (&lt;40%)
          </p>
          <div className="grid grid-cols-2 gap-3">
            {data.competencias_debiles.map((c) => (
              <div key={c.id} className="border border-[#FEF3C7] bg-[#FFFBEB] rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-[#92400E]">PE{c.id}</p>
                    <p className="text-[13px] text-[#111827] mt-0.5">{c.texto_corto}</p>
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

      {/* Floating row tooltip */}
      {rowTooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 bg-white border border-[#E5E7EB] rounded-lg shadow-lg text-[13px] text-[#374151] leading-snug"
          style={{
            left: rowTooltip.x + 16,
            top: rowTooltip.y,
            transform: "translateY(-50%)",
            maxWidth: 350,
          }}
        >
          {rowTooltip.text}
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
