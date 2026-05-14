"use client";

import { useEffect, useState, useMemo } from "react";
import { SlidersHorizontal, Download, ChevronDown } from "lucide-react";
import { getConexiones } from "@/lib/api";

const CARRERAS = [
  { code: "Todas", label: "Todas" },
  { code: "IOC", label: "Civil" },
  { code: "ICI", label: "Industrial" },
  { code: "ICC", label: "Informática" },
  { code: "ICE", label: "Eléctrica" },
  { code: "ICA", label: "Ambiental" },
  { code: "ING", label: "Plan Común" },
];

const CARRERA_COLORS: Record<string, string> = {
  IOC: "#1B2A4A",
  ICI: "#243B6E",
  ING: "#2F5292",
  ICE: "#3B6DC1",
  ICC: "#4A85D4",
  ICA: "#6B8EB8",
};

type Curso = {
  id: string; nombre: string; carrera: string; carrera_nombre: string;
  recibe_de: number; alimenta_a: number; total_conexiones: number;
};
type Stats = {
  cursos_analizados: number; conexiones_totales: number;
  cursos_hub: number; cursos_huerfanos: number; promedio_por_curso: number;
};

export default function ConexionesPage() {
  const [data, setData] = useState<{ cursos: Curso[]; stats: Stats } | null>(null);
  const [selectedCarrera, setSelectedCarrera] = useState("Todas");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carrera = selectedCarrera === "Todas" ? undefined : selectedCarrera;
    setLoading(true);
    getConexiones(carrera)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCarrera]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.cursos;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) => r.id.toLowerCase().includes(q) || r.nombre.toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) =>
      sortDir === "desc"
        ? b.total_conexiones - a.total_conexiones
        : a.total_conexiones - b.total_conexiones
    );
  }, [data, search, sortDir]);

  const stats = data?.stats;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Conexiones</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Cómo cada <span className="text-[#1B2A4A]">curso</span> recibe pre-requisitos y{" "}
            <span className="text-[#1B2A4A]">alimenta</span> a otros en la malla.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E7EB] rounded-md text-[12px] text-[#6B7280] hover:bg-[#F9FAFB] transition-colors">
            <SlidersHorizontal size={13} /> Filtros
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E7EB] rounded-md text-[12px] text-[#6B7280] hover:bg-[#F9FAFB] transition-colors">
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MiniStatCard label="CURSOS ANALIZADOS" value={stats?.cursos_analizados ?? 0} sub="Todas las carreras" dotColor="#6B7280" />
        <MiniStatCard label="CONEXIONES TOTALES" value={stats?.conexiones_totales ?? 0} sub={`Promedio ${stats?.promedio_por_curso ?? 0} por curso`} dotColor="#10B981" />
        <MiniStatCard label="CURSOS HUB (>10 SALIDAS)" value={stats?.cursos_hub ?? 0} sub="Concentran flujo" dotColor="#F59E0B" />
        <MiniStatCard label="CURSOS HUÉRFANOS" value={stats?.cursos_huerfanos ?? 0} sub="Sin entradas ni salidas" dotColor="#EF4444" />
      </div>

      {/* Search + tabs */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <input
          type="text"
          placeholder="Buscar curso por nombre o código…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-md outline-none focus:border-[#1B2A4A] transition-colors"
        />
        <div className="flex gap-1">
          {CARRERAS.map((c) => (
            <button
              key={c.code}
              onClick={() => setSelectedCarrera(c.code)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
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

      {/* Table */}
      <div className="border border-[#E5E7EB] rounded-xl overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
              <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase w-24">ID</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase">NOMBRE</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase w-28">CARRERA</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase w-24">RECIBE DE</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase w-24">ALIMENTA A</th>
              <th
                className="text-right px-4 py-3 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase w-32 cursor-pointer hover:text-[#111827] select-none"
                onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              >
                <span className="flex items-center justify-end gap-1">
                  TOTAL CONEXIONES
                  <ChevronDown size={12} className={sortDir === "asc" ? "rotate-180" : ""} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[#9CA3AF] text-[13px]">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[#9CA3AF] text-[13px]">
                  No se encontraron cursos
                </td>
              </tr>
            ) : (
              filtered.map((curso) => (
                <tr key={curso.id} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors">
                  <td className="px-4 py-3 font-mono text-[12px] text-[#1B2A4A]">{curso.id}</td>
                  <td className="px-4 py-3 text-[#111827]">{curso.nombre}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-medium text-white"
                      style={{ backgroundColor: CARRERA_COLORS[curso.carrera] ?? "#6B7280" }}
                    >
                      {curso.carrera_nombre}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#6B7280]">{curso.recibe_de}</td>
                  <td className="px-4 py-3 text-right text-[#6B7280]">{curso.alimenta_a}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#111827]">{curso.total_conexiones}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniStatCard({ label, value, sub, dotColor }: { label: string; value: number; sub: string; dotColor: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-xl p-4">
      <p className="text-[9px] font-semibold tracking-widest text-[#6B7280] uppercase mb-1">{label}</p>
      <p className="text-[28px] font-bold text-[#111827] leading-none mb-1">{value.toLocaleString()}</p>
      <p className="text-[11px] text-[#6B7280] flex items-center gap-1">
        <span style={{ color: dotColor }}>●</span> {sub}
      </p>
    </div>
  );
}
