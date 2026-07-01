"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { SlidersHorizontal, X, ThumbsUp, ThumbsDown, MessageSquare, ChevronDown } from "lucide-react";
import {
  getAIConexiones,
  getAIStats,
  castAIVote,
  exportAIConexiones,
  getCarreras,
  type AIRaPeProposal,
  type AIStats,
} from "@/lib/api";
import { downloadCSV } from "@/lib/csv";
import SyncButton from "@/components/SyncButton";
import ExportCsvButton from "@/components/ExportCsvButton";

// Fallback mientras carga /api/carreras (que además incluye las planillas subidas)
const CARRERAS_FALLBACK = [
  { code: "ICC", label: "Computación" },
  { code: "ICI", label: "Industrial" },
  { code: "IOC", label: "Obras Civiles" },
  { code: "ICE", label: "Eléctrica" },
  { code: "ICA", label: "Ambiental" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:  { label: "Pendiente", color: "#F59E0B" },
  approved: { label: "Aprobada",  color: "#10B981" },
  rejected: { label: "Rechazada", color: "#EF4444" },
};

const CONF_COLOR = (c: number) => {
  if (c >= 0.75) return "#10B981";
  if (c >= 0.5)  return "#F59E0B";
  if (c >= 0.3)  return "#EF4444";
  return "#9CA3AF";
};

const CONF_TOOLTIP = (c: number) => {
  if (c >= 0.8) return "Conexión directa y explícita";
  if (c >= 0.5) return "Conexión razonable pero indirecta";
  if (c >= 0.3) return "Conexión débil o tangencial";
  return "Conexión muy débil";
};

type SortOption = "confianza_desc" | "confianza_asc";

const PAGE_SIZE = 100;

export default function ConexionesPage() {
  const [carreras, setCarreras] = useState(CARRERAS_FALLBACK);
  const [carrera, setCarrera] = useState("ICC");
  const [loading, setLoading] = useState(true);

  // Carreras dinámicas: base + planillas subidas
  useEffect(() => {
    getCarreras()
      .then((r) => setCarreras(r.carreras.map((c) => ({ code: c.code, label: c.nombre }))))
      .catch(console.error);
  }, []);
  const [proposals, setProposals]   = useState<AIRaPeProposal[]>([]);
  const [stats, setStats]           = useState<AIStats | null>(null);
  const [total, setTotal]           = useState(0);
  const [offset, setOffset]         = useState(0);

  // filters
  const [fStatus, setFStatus]         = useState("Todos");
  const [fPE,     setFPE]             = useState("");
  const [fCurso,  setFCurso]          = useState("");
  const [fRA,     setFRA]             = useState("");
  const [fSort,   setFSort]           = useState<SortOption>("confianza_desc");
  const [fConfMin, setFConfMin]       = useState(0);
  const [fConfMax, setFConfMax]       = useState(100);

  // filter popup
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; right: number } | null>(null);

  // vote modal
  const [voting, setVoting]       = useState<{ id: number; voto: "approve" | "reject"; currentStatus: string } | null>(null);
  const [comentario, setComentario] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const popupRef = useRef<HTMLDivElement>(null);

  // Close popup on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inBtn = filterBtnRef.current?.contains(target);
      const inPopup = popupRef.current?.contains(target);
      if (!inBtn && !inPopup) setFilterOpen(false);
    }
    if (filterOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen]);

  const fetchData = useCallback(async (
    car: string,
    off: number,
    status: string,
    sort: SortOption,
    confMin: number,
    confMax: number,
  ) => {
    setLoading(true);
    try {
      const [data, st] = await Promise.all([
        getAIConexiones({
          carrera: car,
          status: status !== "Todos" ? status : undefined,
          sort,
          confianza_min: confMin / 100,
          confianza_max: confMax / 100,
          limit: PAGE_SIZE,
          offset: off,
        }),
        getAIStats(car),
      ]);
      setProposals(data.proposals);
      setTotal(data.total);
      setStats(st);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOffset(0);
    fetchData(carrera, 0, fStatus, fSort, fConfMin, fConfMax);
  }, [carrera, fStatus, fSort, fConfMin, fConfMax, fetchData]);

  const filtered = useMemo(() => {
    return proposals.filter((p) => {
      if (fPE    && !p.pe_id.toLowerCase().includes(fPE.toLowerCase()))       return false;
      if (fCurso && !p.curso_id.toLowerCase().includes(fCurso.toLowerCase())) return false;
      if (fRA    && !p.ra_texto.toLowerCase().includes(fRA.toLowerCase()))     return false;
      return true;
    });
  }, [proposals, fPE, fCurso, fRA]);

  // Count active filters (excluding carrera and sort)
  const activeFilterCount = [
    fStatus !== "Todos",
    fPE !== "",
    fCurso !== "",
    fRA !== "",
    fConfMin !== 0 || fConfMax !== 100,
  ].filter(Boolean).length;

  function clearAllFilters() {
    setFStatus("Todos");
    setFPE("");
    setFCurso("");
    setFRA("");
    setFConfMin(0);
    setFConfMax(100);
    setFSort("confianza_desc");
  }

  async function handleVote(id: number, voto: "approve" | "reject", currentStatus: string) {
    setVoting({ id, voto, currentStatus });
    setComentario("");
  }

  function conexionesVoteTitle(voto: "approve" | "reject", currentStatus: string): string {
    if (currentStatus === "pending") {
      return voto === "approve" ? "Aprobar propuesta" : "Rechazar propuesta";
    }
    if (voto === "approve") {
      return currentStatus === "rejected" ? "Cambiar a aprobada" : "Confirmar aprobación";
    }
    return currentStatus === "approved" ? "Cambiar a rechazada" : "Confirmar rechazo";
  }

  async function submitVote() {
    if (!voting) return;
    setSubmitting(true);
    try {
      const { proposal } = await castAIVote("ra_pe", voting.id, voting.voto, comentario || undefined);
      setProposals((prev) =>
        prev.map((p) => (p.id === voting.id ? { ...p, ...proposal } : p))
      );
      getAIStats(carrera).then(setStats).catch(() => {});
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo guardar el voto.");
    } finally {
      setSubmitting(false);
      setVoting(null);
      setComentario("");
    }
  }

  const CSV_HEADERS = [
    "ID", "Carrera", "Curso", "Nombre curso", "RA", "Texto RA",
    "PE", "Texto PE", "Confianza", "Razón", "Estado",
  ];
  const STATUS_CSV: Record<string, string> = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };

  function proposalToRow(p: AIRaPeProposal) {
    return [
      p.id, p.carrera, p.curso_id, p.curso_nombre, p.ra_id, p.ra_texto,
      p.pe_id, p.pe_texto, p.confianza.toFixed(2).replace(".", ","),
      p.razon, STATUS_CSV[p.status] ?? p.status,
    ];
  }

  async function handleExport(scope: "filtered" | "all") {
    const hoy = new Date().toISOString().slice(0, 10);
    if (scope === "all") {
      const data = await exportAIConexiones(carrera);
      downloadCSV(`conexiones_${carrera}_todas_${hoy}.csv`, CSV_HEADERS, data.conexiones.map(proposalToRow));
      return;
    }
    // Vista actual: mismos filtros de servidor que la tabla, sin paginación,
    // más los filtros locales de texto (PE, curso, RA).
    const data = await getAIConexiones({
      carrera,
      status: fStatus !== "Todos" ? fStatus : undefined,
      sort: fSort,
      confianza_min: fConfMin / 100,
      confianza_max: fConfMax / 100,
      limit: 100000,
      offset: 0,
    });
    const rows = data.proposals.filter((p) => {
      if (fPE    && !p.pe_id.toLowerCase().includes(fPE.toLowerCase()))       return false;
      if (fCurso && !p.curso_id.toLowerCase().includes(fCurso.toLowerCase())) return false;
      if (fRA    && !p.ra_texto.toLowerCase().includes(fRA.toLowerCase()))     return false;
      return true;
    });
    downloadCSV(`conexiones_${carrera}_filtradas_${hoy}.csv`, CSV_HEADERS, rows.map(proposalToRow));
  }

  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Conexiones RA → PE</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Propuestas generadas por IA que conectan Resultados de Aprendizaje con Perfiles de Egreso.
            Aprueba o rechaza cada propuesta.
          </p>
        </div>
        <div className="flex gap-2.5">
          <SyncButton
            onSync={async () => {
              await Promise.all([
                fetchData(carrera, offset, fStatus, fSort, fConfMin, fConfMax),
                getCarreras()
                  .then((r) => setCarreras(r.carreras.map((c) => ({ code: c.code, label: c.nombre }))))
                  .catch(() => {}),
              ]);
            }}
          />
          <ExportCsvButton
            onExport={handleExport}
            filteredLabel="Vista actual (con filtros)"
            allLabel={`Todas las propuestas (${carrera})`}
            filteredCount={filtered.length < total ? undefined : filtered.length}
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard label="TOTAL PROPUESTAS"  value={stats?.ra_pe.total ?? 0}    dot="#6B7280" />
        <KpiCard label="PENDIENTES"        value={stats?.ra_pe.pending ?? 0}  dot="#F59E0B" />
        <KpiCard label="APROBADAS"         value={stats?.ra_pe.approved ?? 0} dot="#10B981" />
        <KpiCard label="RECHAZADAS"        value={stats?.ra_pe.rejected ?? 0} dot="#EF4444" />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 mb-4">
        {/* Carrera chips */}
        <div className="flex gap-1">
          {carreras.map((c) => (
            <button
              key={c.code}
              onClick={() => setCarrera(c.code)}
              title={c.label}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                carrera === c.code
                  ? "bg-[#1B2A4A] text-white"
                  : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
              }`}
            >
              {c.code}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Active filter summary pill */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[#6B7280] bg-[#F3F4F6] hover:bg-[#E5E7EB] transition-colors"
          >
            <X size={12} />
            Limpiar filtros ({activeFilterCount})
          </button>
        )}

        {/* Filters button */}
        <div className="relative" ref={filterRef}>
          <button
            ref={filterBtnRef}
            onClick={() => {
              if (!filterOpen && filterBtnRef.current) {
                const r = filterBtnRef.current.getBoundingClientRect();
                setPopupPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
              }
              setFilterOpen((v) => !v);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors ${
              filterOpen || activeFilterCount > 0
                ? "bg-[#1B2A4A] text-white border-[#1B2A4A]"
                : "border-[#E5E7EB] text-[#374151] hover:bg-[#F9FAFB]"
            }`}
          >
            <SlidersHorizontal size={14} />
            Filtros
            {activeFilterCount > 0 && (
              <span className="ml-0.5 bg-white text-[#1B2A4A] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown size={13} className={`transition-transform ${filterOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Filter popup — fixed so overflow-hidden on layout doesn't clip it */}
          {filterOpen && popupPos && (
            <div
              ref={popupRef}
              className="fixed z-50 bg-white border border-[#E5E7EB] rounded-xl shadow-lg w-[320px] max-h-[80vh] overflow-y-auto p-5"
              style={{ top: popupPos.top, right: popupPos.right }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-[13px] font-semibold text-[#111827]">Filtros</span>
                <button onClick={() => setFilterOpen(false)} className="text-[#9CA3AF] hover:text-[#374151]">
                  <X size={14} />
                </button>
              </div>

              {/* Confidence range */}
              <div className="mb-5">
                <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
                  Confianza IA
                </label>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold" style={{ color: CONF_COLOR(fConfMin / 100) }}>
                    {fConfMin}%
                  </span>
                  <span className="text-[11px] text-[#9CA3AF]">—</span>
                  <span className="text-[13px] font-semibold" style={{ color: CONF_COLOR(fConfMax / 100) }}>
                    {fConfMax}%
                  </span>
                </div>
                <DualRangeSlider
                  min={0} max={100}
                  valueMin={fConfMin} valueMax={fConfMax}
                  onChange={(lo, hi) => { setFConfMin(lo); setFConfMax(hi); }}
                />
                {/* Quick presets */}
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {[
                    { label: "≥ 80%", lo: 80, hi: 100 },
                    { label: "60–80%", lo: 60, hi: 80 },
                    { label: "40–60%", lo: 40, hi: 60 },
                    { label: "< 40%", lo: 0, hi: 40 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => { setFConfMin(preset.lo); setFConfMax(preset.hi); }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        fConfMin === preset.lo && fConfMax === preset.hi
                          ? "bg-[#1B2A4A] text-white"
                          : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-[#F3F4F6] mb-4" />

              {/* Status */}
              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                  Estado
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { value: "Todos", label: "Todos" },
                    { value: "pending",  label: "Pendiente" },
                    { value: "approved", label: "Aprobada" },
                    { value: "rejected", label: "Rechazada" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFStatus(opt.value)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        fStatus === opt.value
                          ? "bg-[#1B2A4A] text-white"
                          : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* PE */}
              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                  Perfil de Egreso (PE)
                </label>
                <InlineInput value={fPE} onChange={setFPE} placeholder="Ej: PE6, PE10…" />
              </div>

              {/* Curso */}
              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                  Curso
                </label>
                <InlineInput value={fCurso} onChange={setFCurso} placeholder="Ej: ICC_3103…" />
              </div>

              {/* RA text */}
              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                  Texto del RA
                </label>
                <InlineInput value={fRA} onChange={setFRA} placeholder="Buscar en objetivos…" />
              </div>

              <div className="border-t border-[#F3F4F6] mb-4" />

              {/* Sort */}
              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                  Ordenar por
                </label>
                <select
                  value={fSort}
                  onChange={(e) => setFSort(e.target.value as SortOption)}
                  className="w-full text-[13px] border border-[#E5E7EB] rounded-lg px-3 py-2 text-[#374151] focus:outline-none focus:border-[#1B2A4A]"
                >
                  <option value="confianza_desc">Confianza: mayor a menor</option>
                  <option value="confianza_asc">Confianza: menor a mayor</option>
                </select>
              </div>

              {/* Footer */}
              <div className="flex gap-2">
                <button
                  onClick={clearAllFilters}
                  className="flex-1 py-2 text-[12px] border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F9FAFB] transition-colors"
                >
                  Limpiar todo
                </button>
                <button
                  onClick={() => setFilterOpen(false)}
                  className="flex-1 py-2 text-[12px] bg-[#1B2A4A] text-white rounded-lg hover:bg-[#243560] transition-colors font-medium"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active filter pills summary */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {fStatus !== "Todos" && (
            <FilterPill label={`Estado: ${STATUS_LABELS[fStatus]?.label ?? fStatus}`} onRemove={() => setFStatus("Todos")} />
          )}
          {(fConfMin !== 0 || fConfMax !== 100) && (
            <FilterPill label={`Confianza: ${fConfMin}%–${fConfMax}%`} onRemove={() => { setFConfMin(0); setFConfMax(100); }} />
          )}
          {fPE && (
            <FilterPill label={`PE: ${fPE}`} onRemove={() => setFPE("")} />
          )}
          {fCurso && (
            <FilterPill label={`Curso: ${fCurso}`} onRemove={() => setFCurso("")} />
          )}
          {fRA && (
            <FilterPill label={`RA: "${fRA}"`} onRemove={() => setFRA("")} />
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-[13px] text-[#6B7280]">Cargando propuestas…</p>
      ) : filtered.length === 0 ? (
        <div className="border border-[#E5E7EB] rounded-xl p-8 text-center">
          <p className="text-[13px] text-[#6B7280]">
            {stats?.ra_pe.total === 0
              ? "No hay propuestas generadas. Ve a Configuración → Análisis IA y ejecuta \"Recalcular\"."
              : "No se encontraron propuestas con esos filtros."}
          </p>
        </div>
      ) : (
        <div className="border border-[#E5E7EB] rounded-xl overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold">PE</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold w-[28%]">Descripción PE</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold">Curso</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold">RA</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold w-[28%]">Objetivo (RA)</th>
                <th
                  className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold whitespace-nowrap"
                  title="Qué tan clara es la conexión RA→PE según la IA (0–100%)."
                >
                  Confianza
                </th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold min-w-[180px]">Razón IA</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold">Estado</th>
                <th className="px-3 py-2 text-[11px] text-[#6B7280] font-semibold">Votar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-[#F3F4F6] ${i % 2 === 0 ? "" : "bg-[#FAFAFA]"} hover:bg-[#F0F4FF] transition-colors`}
                >
                  <td className="px-3 py-2 font-semibold text-[#1B2A4A] align-top">{p.pe_id}</td>
                  <td className="px-3 py-2 text-[#374151] leading-relaxed align-top whitespace-normal">{p.pe_texto}</td>
                  <td className="px-3 py-2 text-[#374151] align-top">
                    <div className="font-medium">{p.curso_id}</div>
                    <div className="text-[11px] text-[#9CA3AF] leading-snug mt-0.5">{p.curso_nombre}</div>
                  </td>
                  <td className="px-3 py-2 text-[#6B7280] font-mono text-[11px] align-top">{p.ra_id}</td>
                  <td className="px-3 py-2 text-[#374151] leading-relaxed align-top whitespace-normal">{p.ra_texto}</td>
                  <td className="px-3 py-2 align-top">
                    <span
                      style={{ color: CONF_COLOR(p.confianza) }}
                      className="font-semibold"
                      title={CONF_TOOLTIP(p.confianza)}
                    >
                      {(p.confianza * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#6B7280] leading-relaxed align-top whitespace-normal">{p.razon}</td>
                  <td className="px-3 py-2">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        color: STATUS_LABELS[p.status]?.color ?? "#6B7280",
                        background: (STATUS_LABELS[p.status]?.color ?? "#6B7280") + "18",
                      }}
                    >
                      {STATUS_LABELS[p.status]?.label ?? p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        title="Aprobar"
                        onClick={() => handleVote(p.id, "approve", p.status)}
                        className="p-1 rounded hover:bg-[#ECFDF5] text-[#10B981] transition-colors"
                      >
                        <ThumbsUp size={13} />
                      </button>
                      <button
                        title="Rechazar"
                        onClick={() => handleVote(p.id, "reject", p.status)}
                        className="p-1 rounded hover:bg-[#FEF2F2] text-[#EF4444] transition-colors"
                      >
                        <ThumbsDown size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-[12px] text-[#6B7280]">
          <span>{total} propuestas totales</span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => { const o = Math.max(0, offset - PAGE_SIZE); setOffset(o); fetchData(carrera, o, fStatus, fSort, fConfMin, fConfMax); }}
              className="px-3 py-1 border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB] disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="px-3 py-1">
              {Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => { const o = offset + PAGE_SIZE; setOffset(o); fetchData(carrera, o, fStatus, fSort, fConfMin, fConfMax); }}
              className="px-3 py-1 border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB] disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Vote modal */}
      {voting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[420px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">
                {conexionesVoteTitle(voting.voto, voting.currentStatus)}
              </h3>
              <button onClick={() => setVoting(null)} className="text-[#9CA3AF] hover:text-[#374151]">
                <X size={16} />
              </button>
            </div>
            <p className="text-[12px] text-[#6B7280] mb-4">
              Añade un comentario opcional con tu razonamiento (visible para el equipo).
            </p>
            <div className="flex items-start gap-2 mb-4">
              <MessageSquare size={14} className="text-[#9CA3AF] mt-1 flex-shrink-0" />
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Comentario (opcional)…"
                rows={3}
                className="w-full text-[12px] border border-[#E5E7EB] rounded-md px-3 py-2 focus:outline-none focus:border-[#1B2A4A] resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setVoting(null)}
                className="px-4 py-2 text-[12px] border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F9FAFB]"
              >
                Cancelar
              </button>
              <button
                disabled={submitting}
                onClick={submitVote}
                className={`px-4 py-2 text-[12px] rounded-lg text-white font-medium transition-colors disabled:opacity-50 ${
                  voting.voto === "approve"
                    ? "bg-[#10B981] hover:bg-[#059669]"
                    : "bg-[#EF4444] hover:bg-[#DC2626]"
                }`}
              >
                {submitting ? "Enviando…" : voting.voto === "approve" ? "Confirmar aprobación" : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-xl p-5">
      <p className="text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase mb-2">{label}</p>
      <p className="text-[28px] font-bold text-[#111827] leading-none mb-2 tracking-tight">{value.toLocaleString()}</p>
      <p className="text-[12px] text-[#9CA3AF] flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: dot }} /> propuestas IA
      </p>
    </div>
  );
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#EEF2FF] text-[#1B2A4A] text-[11px] font-medium rounded-full">
      {label}
      <button onClick={onRemove} className="hover:text-[#EF4444] transition-colors">
        <X size={10} />
      </button>
    </span>
  );
}

function InlineInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex items-center">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-3 pr-7 py-2 text-[13px] border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#1B2A4A]"
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-2.5 text-[#9CA3AF] hover:text-[#374151]">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// Dual range slider using two overlapping <input type="range"> elements
function DualRangeSlider({
  min, max, valueMin, valueMax, onChange,
}: {
  min: number; max: number; valueMin: number; valueMax: number;
  onChange: (lo: number, hi: number) => void;
}) {
  const range = max - min;
  const leftPct  = ((valueMin - min) / range) * 100;
  const rightPct = ((valueMax - min) / range) * 100;

  function handleMin(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Math.min(Number(e.target.value), valueMax - 1);
    onChange(v, valueMax);
  }
  function handleMax(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Math.max(Number(e.target.value), valueMin + 1);
    onChange(valueMin, v);
  }

  return (
    <div className="relative h-6 flex items-center">
      {/* Track background */}
      <div className="absolute w-full h-1.5 bg-[#E5E7EB] rounded-full" />
      {/* Active track */}
      <div
        className="absolute h-1.5 bg-[#1B2A4A] rounded-full"
        style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
      />
      {/* Min thumb */}
      <input
        type="range"
        min={min} max={max} step={1}
        value={valueMin}
        onChange={handleMin}
        className="absolute w-full h-full opacity-0 cursor-pointer z-20"
        style={{ pointerEvents: valueMin >= valueMax - 1 ? "none" : undefined }}
      />
      {/* Max thumb */}
      <input
        type="range"
        min={min} max={max} step={1}
        value={valueMax}
        onChange={handleMax}
        className="absolute w-full h-full opacity-0 cursor-pointer z-20"
      />
      {/* Visual thumb min */}
      <div
        className="absolute w-4 h-4 bg-white border-2 border-[#1B2A4A] rounded-full shadow-sm z-10 -translate-x-1/2 pointer-events-none"
        style={{ left: `${leftPct}%` }}
      />
      {/* Visual thumb max */}
      <div
        className="absolute w-4 h-4 bg-white border-2 border-[#1B2A4A] rounded-full shadow-sm z-10 -translate-x-1/2 pointer-events-none"
        style={{ left: `${rightPct}%` }}
      />
    </div>
  );
}
