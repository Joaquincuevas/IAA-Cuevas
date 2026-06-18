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

  const thCls = "text-left px-5 py-3.5 text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase";

  return (
    <div className="p-10 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-[#111827] tracking-tight">Redundancia y objetivos críticos</h1>
        <p className="text-[14.5px] text-[#6B7280] mt-1">
          Solapamientos entre <span className="text-[#1B2A4A]">cursos</span> y resultados de aprendizaje{" "}
          <span className="text-[#1B2A4A]">huérfanos</span>.
        </p>
      </div>

      {/* Internal tabs */}
      <div className="flex items-center gap-5 mb-6 border-b border-[#E5E7EB]">
        {(["resumen", "huérfanos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`pb-3 text-[14.5px] font-semibold capitalize transition-colors ${
              activeTab === t ? "border-b-2 border-[#1B2A4A] text-[#111827]" : "text-[#6B7280] hover:text-[#111827]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Key KPI */}
      <div className="grid grid-cols-3 gap-5 mb-8">
        <StatCard label="TASA DE REDUNDANCIA (3+ cursos)" value={`${kpi?.tasa_redundancia_pct ?? 0}%`} sub={`RAs sobre-cubiertos ${kpi?.ras_sobre_cubiertos ?? 0} / ${kpi?.total_ras ?? 0}`} dotColor="#EF4444" />
        <StatCard label="RAS SOBRE-CUBIERTOS" value={kpi?.ras_sobre_cubiertos ?? 0} sub="3+ cursos" dotColor="#9CA3AF" />
        <StatCard label="CANTIDAD RAs HUÉRFANOS" value={kpi?.ras_huerfanos ?? 0} sub="Sin curso que los aborde" dotColor="#EF4444" />
      </div>

      {/* Overcovered RAs */}
      {activeTab === "resumen" && (
        <div className="mb-8">
          <h2 className="text-[18px] font-bold text-[#111827] mb-4">RAs trabajados en 3 o más cursos</h2>
          {loading ? (
            <div className="text-[14px] text-[#6B7280]">Cargando…</div>
          ) : data && data.overcovered.length === 0 ? (
            <div className="text-[14px] text-[#6B7280]">No se encontraron RAs sobre-cubiertos.</div>
          ) : (
            <div className="border border-[#E5E7EB] rounded-2xl overflow-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                    <th className={thCls}>ID Objetivo</th>
                    <th className={thCls}>Descripción</th>
                    <th className={`${thCls} text-right`}>Cursos</th>
                    <th className={`${thCls} text-right`}># Cursos</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.overcovered.map((o) => (
                    <tr key={o.id_objetivo} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors align-top">
                      <td className="px-5 py-3.5 font-mono text-[12px] text-[#1B2A4A] font-semibold">{o.id_objetivo}</td>
                      <td className="px-5 py-3.5 text-[#111827] leading-relaxed">{o.descripcion || "(sin descripción)"}</td>
                      <td className="px-5 py-3.5 text-right text-[13px] text-[#6B7280]">{o.cursos_lista.join(", ")}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-[#111827]">{o.cursos_demandantes}</td>
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
        <div className="mb-8">
          <h2 className="text-[18px] font-bold text-[#111827] mb-4">RAs no trabajados en la malla (huérfanos)</h2>
          {loading ? (
            <div className="text-[14px] text-[#6B7280]">Cargando…</div>
          ) : data && data.orphans.length === 0 ? (
            <div className="text-[14px] text-[#6B7280]">No se encontraron objetivos huérfanos.</div>
          ) : (
            <div className="border border-[#E5E7EB] rounded-2xl overflow-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                    <th className={thCls}>ID Objetivo</th>
                    <th className={thCls}>Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.orphans.map((o) => (
                    <tr key={o.id_objetivo} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors align-top">
                      <td className="px-5 py-3.5 font-mono text-[12px] text-[#1B2A4A] font-semibold">{o.id_objetivo}</td>
                      <td className="px-5 py-3.5 text-[#111827] leading-relaxed">{o.descripcion || "(sin descripción)"}</td>
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
    <div className="border border-[#E5E7EB] rounded-2xl p-6">
      <p className="text-[11.5px] font-semibold tracking-widest text-[#6B7280] uppercase mb-3">{label}</p>
      <p className="text-[36px] font-bold text-[#111827] leading-none mb-3 tracking-tight">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-[13px] text-[#6B7280] flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: dotColor }} /> {sub}
      </p>
    </div>
  );
}
