"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Download, Search, X, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import {
  getAIConexiones,
  getAIStats,
  castAIVote,
  exportAIConexiones,
  type AIRaPeProposal,
  type AIStats,
} from "@/lib/api";

const CARRERAS = [
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
  return "#9CA3AF";
};

const PAGE_SIZE = 100;

export default function ConexionesPage() {
  const [carrera, setCarrera] = useState("ICC");
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals]   = useState<AIRaPeProposal[]>([]);
  const [stats, setStats]           = useState<AIStats | null>(null);
  const [total, setTotal]           = useState(0);
  const [offset, setOffset]         = useState(0);

  // filters
  const [fStatus, setFStatus] = useState("Todos");
  const [fPE,     setFPE]     = useState("");
  const [fCurso,  setFCurso]  = useState("");
  const [fRA,     setFRA]     = useState("");

  // vote modal
  const [voting, setVoting]       = useState<{ id: number; voto: "approve" | "reject" } | null>(null);
  const [comentario, setComentario] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async (car: string, off: number, status: string) => {
    setLoading(true);
    try {
      const [data, st] = await Promise.all([
        getAIConexiones({
          carrera: car,
          status: status !== "Todos" ? status : undefined,
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
    fetchData(carrera, 0, fStatus);
  }, [carrera, fStatus, fetchData]);

  const filtered = useMemo(() => {
    return proposals.filter((p) => {
      if (fPE    && !p.pe_id.toLowerCase().includes(fPE.toLowerCase()))     return false;
      if (fCurso && !p.curso_id.toLowerCase().includes(fCurso.toLowerCase())) return false;
      if (fRA    && !p.ra_texto.toLowerCase().includes(fRA.toLowerCase()))   return false;
      return true;
    });
  }, [proposals, fPE, fCurso, fRA]);

  async function handleVote(id: number, voto: "approve" | "reject") {
    setVoting({ id, voto });
    setComentario("");
  }

  async function submitVote() {
    if (!voting) return;
    setSubmitting(true);
    try {
      await castAIVote("ra_pe", voting.id, voting.voto, comentario || undefined);
      setProposals((prev) =>
        prev.map((p) =>
          p.id === voting.id ? { ...p, status: voting.voto === "approve" ? "approved" : "rejected" } : p
        )
      );
    } finally {
      setSubmitting(false);
      setVoting(null);
      setComentario("");
    }
  }

  async function handleExport() {
    const data = await exportAIConexiones(carrera);
    const header = "id,carrera,curso_id,curso_nombre,ra_id,ra_texto,pe_id,pe_texto,confianza,razon,status";
    const rows = data.conexiones.map((p) =>
      [p.id, p.carrera, p.curso_id, `"${p.curso_nombre}"`, p.ra_id, `"${p.ra_texto.replace(/"/g, "'")}"`, p.pe_id, `"${p.pe_texto.replace(/"/g, "'")}"`, p.confianza.toFixed(2), `"${p.razon.replace(/"/g, "'")}"`, p.status].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conexiones_aprobadas_${carrera}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Conexiones RA → PE</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Propuestas generadas por IA que conectan Resultados de Aprendizaje con Perfiles de Egreso.
            Aprueba o rechaza cada propuesta.
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E7EB] rounded-md text-[12px] text-[#6B7280] hover:bg-[#F9FAFB] transition-colors"
        >
          <Download size={13} /> Exportar aprobadas
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard label="TOTAL PROPUESTAS"  value={stats?.ra_pe.total ?? 0}    dot="#6B7280" />
        <KpiCard label="PENDIENTES"        value={stats?.ra_pe.pending ?? 0}  dot="#F59E0B" />
        <KpiCard label="APROBADAS"         value={stats?.ra_pe.approved ?? 0} dot="#10B981" />
        <KpiCard label="RECHAZADAS"        value={stats?.ra_pe.rejected ?? 0} dot="#EF4444" />
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 mb-4">
        {/* Carrera selector */}
        <div className="flex gap-1">
          {CARRERAS.map((c) => (
            <button
              key={c.code}
              onClick={() => setCarrera(c.code)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                carrera === c.code
                  ? "bg-[#1B2A4A] text-white"
                  : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
              }`}
            >
              {c.code}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="text-[12px] border border-[#E5E7EB] rounded-md px-2 py-1 text-[#374151]"
        >
          <option>Todos</option>
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobadas</option>
          <option value="rejected">Rechazadas</option>
        </select>

        {/* PE filter */}
        <FilterInput value={fPE} onChange={setFPE} placeholder="PE…" />
        {/* Curso filter */}
        <FilterInput value={fCurso} onChange={setFCurso} placeholder="Curso…" />
        {/* RA text filter */}
        <FilterInput value={fRA} onChange={setFRA} placeholder="Buscar en RA…" wide />
      </div>

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
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold">PE</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold w-[22%]">Descripción PE</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold">Curso</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold">RA</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold w-[24%]">Objetivo</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold">Conf.</th>
                <th className="text-left px-3 py-2 text-[11px] text-[#6B7280] font-semibold w-[16%]">Razón IA</th>
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
                  <td className="px-3 py-2 font-semibold text-[#1B2A4A]">{p.pe_id}</td>
                  <td className="px-3 py-2 text-[#374151] leading-snug">{p.pe_texto.slice(0, 80)}{p.pe_texto.length > 80 ? "…" : ""}</td>
                  <td className="px-3 py-2 text-[#374151]">
                    <div className="font-medium">{p.curso_id}</div>
                    <div className="text-[11px] text-[#9CA3AF]">{p.curso_nombre.slice(0, 28)}</div>
                  </td>
                  <td className="px-3 py-2 text-[#6B7280] font-mono text-[11px]">{p.ra_id}</td>
                  <td className="px-3 py-2 text-[#374151] leading-snug">{p.ra_texto.slice(0, 100)}{p.ra_texto.length > 100 ? "…" : ""}</td>
                  <td className="px-3 py-2">
                    <span style={{ color: CONF_COLOR(p.confianza) }} className="font-semibold">
                      {(p.confianza * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#6B7280] leading-snug">{p.razon.slice(0, 80)}{p.razon.length > 80 ? "…" : ""}</td>
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
                        onClick={() => handleVote(p.id, "approve")}
                        className="p-1 rounded hover:bg-[#ECFDF5] text-[#10B981] transition-colors"
                      >
                        <ThumbsUp size={13} />
                      </button>
                      <button
                        title="Rechazar"
                        onClick={() => handleVote(p.id, "reject")}
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
              onClick={() => { const o = Math.max(0, offset - PAGE_SIZE); setOffset(o); fetchData(carrera, o, fStatus); }}
              className="px-3 py-1 border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB] disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="px-3 py-1">
              {Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => { const o = offset + PAGE_SIZE; setOffset(o); fetchData(carrera, o, fStatus); }}
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
                {voting.voto === "approve" ? "Aprobar" : "Rechazar"} propuesta
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

function KpiCard({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-xl p-5">
      <p className="text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase mb-2">{label}</p>
      <p className="text-[32px] font-bold text-[#111827] leading-none mb-2">{value.toLocaleString()}</p>
      <p className="text-[11px] text-[#9CA3AF] flex items-center gap-1">
        <span style={{ color: dot }}>●</span> propuestas IA
      </p>
    </div>
  );
}

function FilterInput({
  value, onChange, placeholder, wide,
}: {
  value: string; onChange: (v: string) => void; placeholder: string; wide?: boolean;
}) {
  return (
    <div className={`relative flex items-center ${wide ? "flex-1 min-w-[200px]" : ""}`}>
      <Search size={11} className="absolute left-2 text-[#9CA3AF]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-6 pr-6 py-1 text-[12px] border border-[#E5E7EB] rounded-md w-full focus:outline-none focus:border-[#1B2A4A]"
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-2 text-[#9CA3AF] hover:text-[#374151]">
          <X size={11} />
        </button>
      )}
    </div>
  );
}
