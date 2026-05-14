"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { getCobertura } from "@/lib/api";

const CARRERAS = [
  { code: "", label: "Todas" },
  { code: "IOC", label: "Civil" },
  { code: "ICI", label: "Industrial" },
  { code: "ICC", label: "Informática" },
  { code: "ICE", label: "Eléctrica" },
  { code: "ICA", label: "Ambiental" },
  { code: "ING", label: "General" },
];

const SEMESTERS = ["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10"];
const PE_NAMES = ["PE1","PE2","PE3","PE4","PE5","PE6"];

// nivel 0 = no data, 1-5 = depth
function nivelColor(nivel: number): string {
  const palette = [
    "#F3F4F6", // 0 - no data / N/A
    "#E9EDF4", // 1
    "#C7D3E8", // 2
    "#8DA9CC", // 3
    "#4A85D4", // 4
    "#1B2A4A", // 5
  ];
  return palette[Math.min(nivel, 5)];
}

function dotColor(pct: number): string {
  if (pct >= 70) return "#10B981";
  if (pct >= 50) return "#F59E0B";
  return "#EF4444";
}

type HeatCell = { pe: string; semestre: string; nivel: number };
type Domain = { code: string; name: string; description: string; cobertura: number };

export default function CoberturaPage() {
  const [data, setData] = useState<{
    stats: { cobertura_global: number; dominios: number; dominios_debiles: number; ciclos: number };
    heatmap: HeatCell[];
    domains: Domain[];
  } | null>(null);
  const [selectedCarrera, setSelectedCarrera] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCobertura(selectedCarrera || undefined)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCarrera]);

  // Build heatmap lookup
  const heatLookup = new Map<string, number>();
  data?.heatmap.forEach((c) => heatLookup.set(`${c.pe}-${c.semestre}`, c.nivel));

  // PE row coverage %
  const peCoverage = new Map<string, number>();
  data?.domains.forEach((d) => peCoverage.set(d.code, d.cobertura));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Cobertura curricular</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Profundidad con que cada <span className="text-[#1B2A4A]">dominio del perfil</span> es abordado a lo largo de la malla.
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E7EB] rounded-md text-[12px] text-[#6B7280] hover:bg-[#F9FAFB] transition-colors">
          <Download size={13} /> PDF
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="COBERTURA GLOBAL" value={`${data?.stats.cobertura_global ?? 0}%`} sub="Cells ≥ Nivel 3 sobre el total" dotColor={dotColor(data?.stats.cobertura_global ?? 0)} />
        <StatCard label="PERFIL DE EGRESO" value={String(data?.stats.dominios ?? 6)} sub="Dominios analizados" dotColor="#6B7280" />
        <StatCard label="DOMINIOS DÉBILES" value={String(data?.stats.dominios_debiles ?? 0)} sub="Cobertura < 70%" dotColor="#F59E0B" />
        <StatCard label="CICLOS" value={String(data?.stats.ciclos ?? 10)} sub="Semestres × 1 año académico" dotColor="#6B7280" />
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
                onClick={() => setSelectedCarrera(c.code)}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  selectedCarrera === c.code
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
          <div className="h-40 flex items-center justify-center text-[#9CA3AF] text-[13px]">Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr>
                  <th className="text-left pr-4 pb-2 text-[10px] font-semibold text-[#6B7280] w-40" />
                  {SEMESTERS.map((s) => (
                    <th key={s} className="text-center pb-2 text-[10px] font-semibold text-[#6B7280] w-10">{s}</th>
                  ))}
                  <th className="text-right pb-2 text-[10px] font-semibold text-[#6B7280] w-12">%</th>
                </tr>
              </thead>
              <tbody>
                {data?.domains.map((domain) => {
                  const pct = peCoverage.get(domain.code) ?? 0;
                  return (
                    <tr key={domain.code}>
                      <td className="pr-4 py-1">
                        <div className="text-[10px] font-semibold text-[#6B7280]">{domain.code}</div>
                        <div className="text-[11px] text-[#111827]">{domain.name}</div>
                      </td>
                      {SEMESTERS.map((s) => {
                        const nivel = heatLookup.get(`${domain.code}-${s}`) ?? 0;
                        return (
                          <td key={s} className="py-1 px-0.5">
                            <div
                              className="h-8 w-full rounded-sm"
                              style={{ backgroundColor: nivelColor(nivel) }}
                              title={`${domain.code} × ${s}: Nivel ${nivel}`}
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
        )}

        {/* Legend */}
        <div className="flex items-center gap-3 mt-4">
          <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Nivel de profundidad</span>
          {[{ label: "N/A", n: 0 }, { label: "1", n: 1 }, { label: "2", n: 2 }, { label: "3", n: 3 }, { label: "4", n: 4 }, { label: "5", n: 5 }].map(({ label, n }) => (
            <div key={n} className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: nivelColor(n) }} />
              <span className="text-[10px] text-[#6B7280]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Domain cards */}
      <div>
        <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase mb-3">Dominios del perfil de egreso</p>
        <div className="grid grid-cols-2 gap-4">
          {data?.domains.map((d) => {
            const pct = d.cobertura;
            const color = dotColor(pct);
            return (
              <div key={d.code} className="border border-[#E5E7EB] rounded-xl p-5">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className="text-[10px] font-semibold text-[#6B7280]">{d.code}</p>
                    <p className="text-[14px] font-bold text-[#111827]">{d.name}</p>
                    <p className="text-[12px] text-[#6B7280] mt-0.5">{d.description}</p>
                  </div>
                  <p className="text-[28px] font-bold text-[#111827] ml-4">{pct}%</p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-[10px] font-medium" style={{ color }}>cobertura</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, dotColor: dc }: { label: string; value: string; sub: string; dotColor: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-xl p-4">
      <p className="text-[9px] font-semibold tracking-widest text-[#6B7280] uppercase mb-1">{label}</p>
      <p className="text-[28px] font-bold text-[#111827] leading-none mb-1">{value}</p>
      <p className="text-[11px] text-[#6B7280] flex items-center gap-1">
        <span style={{ color: dc }}>●</span> {sub}
      </p>
    </div>
  );
}
