"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getRedundancia } from "@/lib/api";

type Cluster = {
  id: string; nombre: string; severidad: string; overlap: number;
  cursos: { id: string; nombre: string }[];
  total_objetivos: number; total_cursos: number;
};

function severidadColor(sev: string): { bg: string; text: string; dot: string } {
  if (sev === "Alta") return { bg: "#FEF2F2", text: "#991B1B", dot: "#EF4444" };
  if (sev === "Media") return { bg: "#FFFBEB", text: "#92400E", dot: "#F59E0B" };
  return { bg: "#F0FDF4", text: "#166534", dot: "#10B981" };
}

function overlapBarColor(pct: number): string {
  if (pct >= 65) return "#EF4444";
  if (pct >= 45) return "#F59E0B";
  return "#10B981";
}

export default function RedundanciaPage() {
  const [data, setData] = useState<{
    clusters: Cluster[];
    stats: { clusters_detectados: number; horas_duplicadas: number; ras_huerfanos: number; ras_sobre_cubiertos: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRedundancia()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;

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

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="CLUSTERS DETECTADOS" value={stats?.clusters_detectados ?? 0} sub="3 con acción recomendada" dotColor="#F59E0B" />
        <StatCard label="HORAS DUPLICADAS" value={stats?.horas_duplicadas ?? 0} sub="Estimación semestral" dotColor="#F59E0B" />
        <StatCard label="RAS HUÉRFANOS" value={stats?.ras_huerfanos ?? 0} sub="Sin curso que los aborde" dotColor="#EF4444" />
        <StatCard label="RAS SOBRE-CUBIERTOS" value={stats?.ras_sobre_cubiertos ?? 0} sub="3+ cursos con mismo objetivo" dotColor="#6B7280" />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-[#E5E7EB] mb-6">
        <button className="pb-2 text-[13px] font-semibold text-[#111827] border-b-2 border-[#111827]">
          Clusters de solapamiento
        </button>
        <button className="pb-2 text-[13px] text-[#6B7280] hover:text-[#111827] transition-colors">
          Objetivos huérfanos
        </button>
      </div>

      {/* Clusters */}
      {loading ? (
        <div className="text-center py-20 text-[#9CA3AF] text-[13px]">Cargando clusters…</div>
      ) : data?.clusters.length === 0 ? (
        <div className="text-center py-20 text-[#9CA3AF] text-[13px]">No se detectaron clusters de solapamiento significativos.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {data?.clusters.map((cluster, i) => {
            const sev = severidadColor(cluster.severidad);
            const barColor = overlapBarColor(cluster.overlap);
            return (
              <div key={i} className="border border-[#E5E7EB] rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-semibold tracking-widest text-[#9CA3AF] uppercase">
                        {cluster.id}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: sev.bg, color: sev.text }}
                      >
                        ● Severidad {cluster.severidad}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-bold text-[#111827] mb-3">{cluster.nombre}</h3>
                    {/* Overlap bar */}
                    <div className="w-full h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${cluster.overlap}%`, backgroundColor: barColor }}
                      />
                    </div>
                    {/* Course tags */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Cursos</span>
                      {cluster.cursos.map((c) => (
                        <span
                          key={c.id}
                          className="text-[11px] px-2 py-0.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded text-[#1B2A4A] font-medium"
                        >
                          {c.id} {c.nombre}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-8">
                    <div className="text-right">
                      <p className="text-[28px] font-bold text-[#111827] leading-none">{cluster.overlap}%</p>
                      <p className="text-[10px] text-[#9CA3AF]">overlap promedio</p>
                    </div>
                    <button className="flex items-center gap-1 text-[12px] text-[#1B2A4A] font-medium hover:underline">
                      Ver detalle <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, dotColor }: { label: string; value: number; sub: string; dotColor: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-xl p-4">
      <p className="text-[9px] font-semibold tracking-widest text-[#6B7280] uppercase mb-1">{label}</p>
      <p className="text-[28px] font-bold text-[#111827] leading-none mb-1">{value}</p>
      <p className="text-[11px] text-[#6B7280] flex items-center gap-1">
        <span style={{ color: dotColor }}>●</span> {sub}
      </p>
    </div>
  );
}
