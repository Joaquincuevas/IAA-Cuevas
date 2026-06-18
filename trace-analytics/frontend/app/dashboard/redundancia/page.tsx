"use client";

import { useEffect, useState, useCallback } from "react";
import { ThumbsUp, ThumbsDown, X, MessageSquare } from "lucide-react";
import {
  getAIRedundancia,
  getAIStats,
  castAIVote,
  type AIRedundancyProposal,
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
  approved: { label: "Confirmada", color: "#EF4444" },
  rejected: { label: "Descartada", color: "#10B981" },
};

const TIPO_LABEL: Record<string, string> = {
  semantica:   "Semántica",
  curricular:  "Curricular",
};

const PAGE_SIZE = 80;

export default function RedundanciaPage() {
  const [carrera,   setCarrera]   = useState("ICC");
  const [loading,   setLoading]   = useState(true);
  const [proposals, setProposals] = useState<AIRedundancyProposal[]>([]);
  const [stats,     setStats]     = useState<AIStats | null>(null);
  const [fStatus,   setFStatus]   = useState("Todos");
  const [offset,    setOffset]    = useState(0);
  const [total,     setTotal]     = useState(0);

  const [voting,     setVoting]     = useState<{ id: number; voto: "approve" | "reject" } | null>(null);
  const [comentario, setComentario] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async (car: string, off: number, status: string) => {
    setLoading(true);
    try {
      const [data, st] = await Promise.all([
        getAIRedundancia({
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

  async function submitVote() {
    if (!voting) return;
    setSubmitting(true);
    try {
      await castAIVote("redundancy", voting.id, voting.voto, comentario || undefined);
      setProposals((prev) =>
        prev.map((p) =>
          p.id === voting.id
            ? { ...p, status: voting.voto === "approve" ? "approved" : "rejected" }
            : p
        )
      );
    } finally {
      setSubmitting(false);
      setVoting(null);
      setComentario("");
    }
  }

  return (
    <div className="p-9 max-w-[1400px]">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-[26px] font-bold text-[#111827] tracking-tight">Redundancia de objetivos</h1>
        <p className="text-[14px] text-[#6B7280] mt-1">
          Pares de Resultados de Aprendizaje semánticamente similares detectados por IA.
          Confirma si son redundantes o descártalos como complementarios.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-5 mb-7">
        <KpiCard label="PARES DETECTADOS" value={stats?.redundancia.total ?? 0}   dot="#6B7280" sub="Por IA (TF-IDF + Groq)" />
        <KpiCard label="PENDIENTES"        value={stats?.redundancia.pending ?? 0} dot="#F59E0B" sub="Sin revisar" />
        <KpiCard
          label="CONFIRMADOS"
          value={(stats?.redundancia.total ?? 0) - (stats?.redundancia.pending ?? 0)}
          dot="#EF4444"
          sub="Aprobados o descartados"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
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
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="text-[12px] border border-[#E5E7EB] rounded-md px-2 py-1 text-[#374151]"
        >
          <option>Todos</option>
          <option value="pending">Pendientes</option>
          <option value="approved">Confirmados</option>
          <option value="rejected">Descartados</option>
        </select>
      </div>

      {/* Cards */}
      {loading ? (
        <p className="text-[13px] text-[#6B7280]">Cargando pares de redundancia…</p>
      ) : proposals.length === 0 ? (
        <div className="border border-[#E5E7EB] rounded-xl p-8 text-center">
          <p className="text-[13px] text-[#6B7280]">
            {stats?.redundancia.total === 0
              ? "No hay pares detectados. Ve a Configuración → Análisis IA y ejecuta \"Recalcular\"."
              : "No se encontraron pares con esos filtros."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <PairCard
              key={p.id}
              proposal={p}
              onVote={(voto) => { setVoting({ id: p.id, voto }); setComentario(""); }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-5 text-[12px] text-[#6B7280]">
          <span>{total} pares totales</span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => { const o = Math.max(0, offset - PAGE_SIZE); setOffset(o); fetchData(carrera, o, fStatus); }}
              className="px-3 py-1 border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB] disabled:opacity-40"
            >Anterior</button>
            <span className="px-2 py-1">{Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(total / PAGE_SIZE)}</span>
            <button
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => { const o = offset + PAGE_SIZE; setOffset(o); fetchData(carrera, o, fStatus); }}
              className="px-3 py-1 border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB] disabled:opacity-40"
            >Siguiente</button>
          </div>
        </div>
      )}

      {/* Vote modal */}
      {voting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[420px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">
                {voting.voto === "approve" ? "Confirmar redundancia" : "Descartar (son complementarios)"}
              </h3>
              <button onClick={() => setVoting(null)} className="text-[#9CA3AF] hover:text-[#374151]">
                <X size={16} />
              </button>
            </div>
            <p className="text-[12px] text-[#6B7280] mb-4">
              Añade un comentario opcional con tu razonamiento pedagógico.
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
              <button onClick={() => setVoting(null)} className="px-4 py-2 text-[12px] border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F9FAFB]">
                Cancelar
              </button>
              <button
                disabled={submitting}
                onClick={submitVote}
                className={`px-4 py-2 text-[12px] rounded-lg text-white font-medium transition-colors disabled:opacity-50 ${
                  voting.voto === "approve" ? "bg-[#EF4444] hover:bg-[#DC2626]" : "bg-[#10B981] hover:bg-[#059669]"
                }`}
              >
                {submitting ? "Enviando…" : voting.voto === "approve" ? "Confirmar redundancia" : "Descartar como complementario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PairCard({
  proposal: p,
  onVote,
}: {
  proposal: AIRedundancyProposal;
  onVote: (voto: "approve" | "reject") => void;
}) {
  const status = STATUS_LABELS[p.status] ?? { label: p.status, color: "#6B7280" };
  const simPct = Math.round(p.similitud * 100);

  return (
    <div className="border border-[#E5E7EB] rounded-xl p-4 hover:border-[#1B2A4A]/20 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Left: pair */}
        <div className="flex-1 grid grid-cols-2 gap-4">
          <RABlock raId={p.ra_id_a} curso={p.curso_a} texto={p.ra_texto_a} />
          <RABlock raId={p.ra_id_b} curso={p.curso_b} texto={p.ra_texto_b} />
        </div>

        {/* Right: meta + actions */}
        <div className="flex flex-col items-end gap-2 min-w-[130px]">
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ color: status.color, background: status.color + "18" }}
            >
              {status.label}
            </span>
            <span className="text-[11px] text-[#6B7280]">
              {TIPO_LABEL[p.tipo] ?? p.tipo}
            </span>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[#6B7280]">Similitud</p>
            <p className="text-[20px] font-bold text-[#1B2A4A] leading-tight">{simPct}%</p>
          </div>
          {p.status === "pending" && (
            <div className="flex gap-1">
              <button
                title="Confirmar redundancia"
                onClick={() => onVote("approve")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[#EF4444] bg-[#FEF2F2] hover:bg-[#FEE2E2] transition-colors"
              >
                <ThumbsUp size={11} /> Redundante
              </button>
              <button
                title="Descartar como complementario"
                onClick={() => onVote("reject")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[#10B981] bg-[#ECFDF5] hover:bg-[#D1FAE5] transition-colors"
              >
                <ThumbsDown size={11} /> No
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Razón IA */}
      {p.razon && (
        <p className="mt-2 text-[11px] text-[#6B7280] italic border-t border-[#F3F4F6] pt-2">
          IA: {p.razon}
        </p>
      )}
    </div>
  );
}

function RABlock({ raId, curso, texto }: { raId: string; curso: string; texto: string }) {
  return (
    <div className="bg-[#F9FAFB] rounded-lg p-3">
      <p className="text-[10px] font-semibold text-[#9CA3AF] mb-0.5">{curso}</p>
      <p className="text-[11px] font-mono text-[#1B2A4A] mb-1">{raId}</p>
      <p className="text-[12px] text-[#374151] leading-snug">{texto.slice(0, 140)}{texto.length > 140 ? "…" : ""}</p>
    </div>
  );
}

function KpiCard({ label, value, dot, sub }: { label: string; value: number; dot: string; sub: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-2xl p-6">
      <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase mb-2.5">{label}</p>
      <p className="text-[34px] font-bold text-[#111827] leading-none mb-2.5 tracking-tight">{value.toLocaleString()}</p>
      <p className="text-[12px] text-[#9CA3AF] flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: dot }} /> {sub}
      </p>
    </div>
  );
}
