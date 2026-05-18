"use client";

import { useEffect, useState } from "react";
import { getRedundancia } from "@/lib/api";

type Overcovered = { id_objetivo: string; cursos_demandantes: number; cursos_lista: string[]; descripcion: string };

type Orphan = { id_objetivo: string; descripcion: string };

export default function RedundanciaPage() {
  const [data, setData] = useState<{
    kpi: { tasa_redundancia_pct: number; total_ras: number; ras_sobre_cubiertos: number; ras_huerfanos: number };
    overcovered: Overcovered[];
    orphans: Orphan[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRedundancia()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const kpi = data?.kpi;
  const [activeTab, setActiveTab] = useState<"resumen" | "huérfanos">("resumen");

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-[#111827]">Redundancia y objetivos críticos</h1>
        <p className="text-[13px] text-[#6B7280] mt-0.5">
          Solapamientos entre <span className="text-[#1B2A4A]">cursos</span> y resultados de aprendizaje{" "}
          <span className="text-[#1B2A4A]">huérfanos</span>.
        </p>
      </div>

      {/* Internal tabs */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setActiveTab("resumen")}
          className={`pb-2 text-[13px] font-semibold ${activeTab === "resumen" ? "border-b-2 border-[#111827] text-[#111827]" : "text-[#6B7280] hover:text-[#111827]"}`}
        >
          Resumen
        </button>
        <button
          onClick={() => setActiveTab("huérfanos")}
          className={`pb-2 text-[13px] font-semibold ${activeTab === "huérfanos" ? "border-b-2 border-[#111827] text-[#111827]" : "text-[#6B7280] hover:text-[#111827]"}`}
        >
          Huérfanos
        </button>
      </div>

      {/* Key KPI */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="TASA DE REDUNDANCIA (3+ cursos)" value={`${kpi?.tasa_redundancia_pct ?? 0}%`} sub={`RAs sobre-cubiertos ${kpi?.ras_sobre_cubiertos ?? 0} / ${kpi?.total_ras ?? 0}`} dotColor="#EF4444" />
        <StatCard label="RAS SOBRE-CUBIERTOS" value={kpi?.ras_sobre_cubiertos ?? 0} sub="3+ cursos" dotColor="#6B7280" />
        <StatCard label="CANTIDAD RAs HUÉRFANOS" value={kpi?.ras_huerfanos ?? 0} sub="Sin curso que los aborde" dotColor="#EF4444" />
      </div>

      {/* Overcovered RAs */}
      {activeTab === "resumen" && (
        <div className="mb-6">
        <h2 className="text-[16px] font-semibold text-[#111827] mb-3">RAs trabajados en 3 o más cursos</h2>
        {loading ? (
          <div className="text-[#6B7280]">Cargando…</div>
        ) : data && data.overcovered.length === 0 ? (
          <div className="text-[#6B7280]">No se encontraron RAs sobre-cubiertos.</div>
        ) : (
          <div className="border border-[#E5E7EB] rounded-xl overflow-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                  <th className="text-left px-4 py-2 text-[12px] text-[#6B7280]">ID Objetivo</th>
                  <th className="text-left px-4 py-2 text-[12px] text-[#6B7280]">Descripción</th>
                  <th className="text-right px-4 py-2 text-[12px] text-[#6B7280]">Cursos</th>
                  <th className="text-right px-4 py-2 text-[12px] text-[#6B7280]"># Cursos</th>
                </tr>
              </thead>
              <tbody>
                {data?.overcovered.map((o) => (
                  <tr key={o.id_objetivo} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
                    <td className="px-4 py-3 font-mono text-[#1B2A4A]">{o.id_objetivo}</td>
                    <td className="px-4 py-3 text-[#111827]">{o.descripcion || "(sin descripción)"}</td>
                    <td className="px-4 py-3 text-right text-[#6B7280]">{o.cursos_lista.join(", ")}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#111827]">{o.cursos_demandantes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      )}

      {/* Orphan RAs - separate tab */}
      {activeTab === "huérfanos" && (
        <div className="mb-6">
          <h2 className="text-[16px] font-semibold text-[#111827] mb-3">RAs no trabajados en la malla (huérfanos)</h2>
          {loading ? (
            <div className="text-[#6B7280]">Cargando…</div>
          ) : data && data.orphans.length === 0 ? (
            <div className="text-[#6B7280]">No se encontraron objetivos huérfanos.</div>
          ) : (
            <div className="border border-[#E5E7EB] rounded-xl overflow-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                    <th className="text-left px-4 py-2 text-[12px] text-[#6B7280]">ID Objetivo</th>
                    <th className="text-left px-4 py-2 text-[12px] text-[#6B7280]">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.orphans.map((o) => (
                    <tr key={o.id_objetivo} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
                      <td className="px-4 py-3 font-mono text-[#1B2A4A]">{o.id_objetivo}</td>
                      <td className="px-4 py-3 text-[#111827]">{o.descripcion || "(sin descripción)"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, dotColor }: { label: string; value: number | string; sub: string; dotColor: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-xl p-4">
      <p className="text-[9px] font-semibold tracking-widest text-[#6B7280] uppercase mb-1">{label}</p>
      <p className="text-[28px] font-bold text-[#111827] leading-none mb-1">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-[11px] text-[#6B7280] flex items-center gap-1">
        <span style={{ color: dotColor }}>●</span> {sub}
      </p>
    </div>
  );
}
