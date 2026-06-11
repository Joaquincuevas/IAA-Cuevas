"use client";

import { useState, useEffect, useMemo } from "react";
import { getTrazabilidad, type TrazabilidadData } from "@/lib/api";

const CARRERA_OPTIONS = [
  { value: "todas", label: "Todas las carreras" },
  { value: "ICA", label: "ICA — Ambiental" },
  { value: "ICC", label: "ICC — Computación" },
  { value: "ICE", label: "ICE — Eléctrica" },
  { value: "IOC", label: "IOC — Obras Civiles" },
  { value: "ICI", label: "ICI — Industrial" },
];

function nivelBadge(nivel: "Alta" | "Media" | "Baja") {
  if (nivel === "Alta")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#1B2A4A] text-white">
        Alta
      </span>
    );
  if (nivel === "Media")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200 text-slate-700">
        Media
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">
      Baja
    </span>
  );
}

function estadoBadge(cubierta: boolean, total: number) {
  if (total === 0)
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-800">
        Sin RAs
      </span>
    );
  if (!cubierta)
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-yellow-100 text-yellow-800">
        Parcial
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-800">
      Cubierta
    </span>
  );
}

function peSort(a: string, b: string) {
  return parseInt(a.slice(2)) - parseInt(b.slice(2));
}

export default function TrazabilidadPage() {
  const [carrera, setCarrera] = useState("ICA");
  const [selectedPE, setSelectedPE] = useState<string | null>(null);
  const [data, setData] = useState<TrazabilidadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedPE(null);
    setError(null);
    const carreraParam = carrera === "todas" ? undefined : carrera;
    getTrazabilidad(carreraParam)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [carrera]);

  // Build PE table rows from pe_summary for the selected carrera
  const peTableRows = useMemo(() => {
    if (!data) return [];
    const carreras =
      data.carrera_filtrada
        ? [data.carrera_filtrada]
        : ["ICA", "ICC", "ICE", "IOC", "ICI"];

    // Aggregate across all carreras when viewing "todas"
    const aggMap: Record<string, { alta: number; media: number; baja: number; cubierta: boolean; descripcion: string }> = {};
    for (const car of carreras) {
      const summary = data.pe_summary[car] ?? {};
      for (const [pe, s] of Object.entries(summary)) {
        if (!aggMap[pe]) {
          aggMap[pe] = { alta: 0, media: 0, baja: 0, cubierta: false, descripcion: s.descripcion };
        }
        aggMap[pe].alta += s.alta;
        aggMap[pe].media += s.media;
        aggMap[pe].baja += s.baja;
        aggMap[pe].cubierta = aggMap[pe].cubierta || s.cubierta;
      }
    }

    const rows = Object.entries(aggMap).map(([pe, s]) => ({
      pe,
      ...s,
      total: s.alta + s.media + s.baja,
    }));

    // Sort: Sin RAs first, Parcial second, Cubierta last
    return rows.sort((a, b) => {
      const order = (r: typeof a) => {
        if (r.total === 0) return 0;
        if (!r.cubierta) return 1;
        return 2;
      };
      const diff = order(a) - order(b);
      if (diff !== 0) return diff;
      return peSort(a.pe, b.pe);
    });
  }, [data]);

  // RAs for the selected PE
  const raRows = useMemo(() => {
    if (!data || !selectedPE) return [];
    return data.mappings
      .filter((m) => m.pe_list.includes(selectedPE))
      .sort((a, b) => {
        const ord = { Alta: 0, Media: 1, Baja: 2 };
        return (ord[a.nivel] ?? 2) - (ord[b.nivel] ?? 2);
      });
  }, [data, selectedPE]);

  // Quick stats
  const stats = useMemo(() => {
    if (!peTableRows.length) return { total: 0, cubiertas: 0, sinCobertura: 0, pct: 0 };
    const cubiertas = peTableRows.filter((r) => r.cubierta).length;
    const sinCobertura = peTableRows.filter((r) => r.total === 0).length;
    return {
      total: data?.total_mappings ?? 0,
      cubiertas,
      sinCobertura,
      pct: Math.round((cubiertas / peTableRows.length) * 100),
    };
  }, [peTableRows, data]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[18px] font-bold text-[#111827]">Trazabilidad RA → Perfil de Egreso</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Visualiza qué Resultados de Aprendizaje construyen cada competencia del PE
          </p>
        </div>
        <select
          value={carrera}
          onChange={(e) => setCarrera(e.target.value)}
          className="text-[13px] border border-[#E5E7EB] rounded-md px-3 py-1.5 text-[#374151] bg-white focus:outline-none focus:ring-1 focus:ring-[#1B2A4A]"
        >
          {CARRERA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total RAs mapeados", value: loading ? "—" : stats.total },
          { label: "PEs cubiertas", value: loading ? "—" : stats.cubiertas },
          { label: "PEs sin cobertura Alta", value: loading ? "—" : peTableRows.filter((r) => !r.cubierta).length },
          { label: "% cobertura global", value: loading ? "—" : `${stats.pct}%` },
        ].map((card) => (
          <div key={card.label} className="border border-[#E5E7EB] rounded-lg p-3 bg-white">
            <p className="text-[11px] text-[#9CA3AF] mb-1">{card.label}</p>
            <p className="text-[22px] font-bold text-[#1B2A4A]">{card.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-[13px]">
          Error al cargar datos: {error}
        </div>
      )}

      <div className="flex gap-4">
        {/* PE coverage table */}
        <div className="flex-1 min-w-0">
          <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#E5E7EB] bg-[#F9FAFB]">
              <p className="text-[12px] font-semibold text-[#374151]">Cobertura por Competencia PE</p>
            </div>
            {loading ? (
              <div className="p-8 text-center text-[13px] text-[#9CA3AF]">Cargando...</div>
            ) : (
              <div className="overflow-auto max-h-[460px]">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-[#F9FAFB] z-10">
                    <tr className="border-b border-[#E5E7EB]">
                      <th className="text-left px-3 py-2 font-semibold text-[#6B7280] w-14">PE</th>
                      <th className="text-left px-3 py-2 font-semibold text-[#6B7280]">Competencia</th>
                      <th className="text-right px-3 py-2 font-semibold text-[#6B7280] w-14">Alta</th>
                      <th className="text-right px-3 py-2 font-semibold text-[#6B7280] w-14">Media</th>
                      <th className="text-right px-3 py-2 font-semibold text-[#6B7280] w-14">Baja</th>
                      <th className="text-right px-3 py-2 font-semibold text-[#6B7280] w-16">Total</th>
                      <th className="text-center px-3 py-2 font-semibold text-[#6B7280] w-24">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peTableRows.map((row) => (
                      <tr
                        key={row.pe}
                        onClick={() => setSelectedPE(selectedPE === row.pe ? null : row.pe)}
                        className={`border-b border-[#F3F4F6] cursor-pointer transition-colors ${
                          selectedPE === row.pe
                            ? "bg-[#EFF6FF]"
                            : "hover:bg-[#F9FAFB]"
                        }`}
                      >
                        <td className="px-3 py-2 font-medium text-[#1B2A4A]">{row.pe}</td>
                        <td className="px-3 py-2 text-[#374151] max-w-[280px]">
                          <span title={row.descripcion}>
                            {row.descripcion.length > 65
                              ? row.descripcion.slice(0, 65) + "…"
                              : row.descripcion}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-[#1B2A4A]">
                          {row.alta > 0 ? row.alta : <span className="text-[#D1D5DB]">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-[#374151]">
                          {row.media > 0 ? row.media : <span className="text-[#D1D5DB]">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-[#374151]">
                          {row.baja > 0 ? row.baja : <span className="text-[#D1D5DB]">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-[#374151]">{row.total}</td>
                        <td className="px-3 py-2 text-center">{estadoBadge(row.cubierta, row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RA detail table */}
          <div className="mt-4 border border-[#E5E7EB] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#E5E7EB] bg-[#F9FAFB]">
              <p className="text-[12px] font-semibold text-[#374151]">
                {selectedPE ? `Resultados de Aprendizaje → ${selectedPE}` : "Resultados de Aprendizaje"}
              </p>
            </div>
            {!selectedPE ? (
              <div className="p-8 text-center text-[13px] text-[#9CA3AF]">
                Selecciona una competencia PE para ver sus RAs asociados
              </div>
            ) : raRows.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[#9CA3AF]">
                No hay RAs mapeados a {selectedPE}
              </div>
            ) : (
              <div className="overflow-auto max-h-[320px]">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-[#F9FAFB] z-10">
                    <tr className="border-b border-[#E5E7EB]">
                      <th className="text-left px-3 py-2 font-semibold text-[#6B7280] w-32">RA</th>
                      <th className="text-left px-3 py-2 font-semibold text-[#6B7280]">Resultado de Aprendizaje</th>
                      <th className="text-left px-3 py-2 font-semibold text-[#6B7280] w-36">Curso</th>
                      <th className="text-center px-3 py-2 font-semibold text-[#6B7280] w-20">Nivel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {raRows.map((m) => (
                      <tr key={m.ra_id} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB]">
                        <td className="px-3 py-2 font-mono text-[11px] text-[#6B7280]">{m.ra_id}</td>
                        <td className="px-3 py-2 text-[#374151]">
                          <span title={m.ra_texto_completo}>
                            {m.ra_texto.length > 90 ? m.ra_texto.slice(0, 90) + "…" : m.ra_texto}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#374151]">
                          <div className="font-medium">{m.curso_id}</div>
                          <div className="text-[11px] text-[#9CA3AF] leading-tight">
                            {m.curso_nombre.length > 28 ? m.curso_nombre.slice(0, 28) + "…" : m.curso_nombre}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">{nivelBadge(m.nivel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
