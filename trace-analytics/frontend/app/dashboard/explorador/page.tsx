"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Search, X, Bookmark, Check } from "lucide-react";
import { getTrazabilidad, saveFilterSnapshot, type RAMapping } from "@/lib/api";

const CARRERAS = [
  { code: "ICC", label: "Computación" },
  { code: "ICI", label: "Industrial" },
  { code: "IOC", label: "Obras Civiles" },
  { code: "ICE", label: "Eléctrica" },
  { code: "ICA", label: "Ambiental" },
];

const NIVEL_COLOR: Record<string, string> = {
  Alta: "#1B2A4A",
  Media: "#6B7280",
  Baja: "#9CA3AF",
};

type Row = {
  pe: string;
  peDesc: string;
  cursoId: string;
  cursoNombre: string;
  raId: string;
  raTexto: string;
  nivel: string;
  carrera: string;
};

const PAGE_SIZE = 200;

export default function ExploradorPage() {
  const [carrera, setCarrera] = useState("ICC");
  const [loading, setLoading] = useState(true);
  const [mappings, setMappings] = useState<RAMapping[]>([]);
  const [peSummary, setPeSummary] = useState<Record<string, Record<string, { descripcion: string }>>>({});

  // filtros
  const [fPE, setFPE] = useState("Todos");
  const [fCurso, setFCurso] = useState("");
  const [fRA, setFRA] = useState("");
  const [fNivel, setFNivel] = useState("Todos");
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    setLoading(true);
    setLimit(PAGE_SIZE);
    getTrazabilidad(carrera)
      .then((res) => {
        setMappings(res.mappings);
        setPeSummary(res.pe_summary as never);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [carrera]);

  // construir filas planas: una por (RA × PE)
  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = [];
    for (const m of mappings) {
      const peMap = peSummary[m.carrera] ?? peSummary[carrera] ?? {};
      if (m.pe_list.length === 0) continue;
      for (const pe of m.pe_list) {
        rows.push({
          pe,
          peDesc: peMap[pe]?.descripcion ?? "",
          cursoId: m.curso_id,
          cursoNombre: m.curso_nombre,
          raId: m.ra_id,
          raTexto: m.ra_texto_completo || m.ra_texto,
          nivel: m.nivel,
          carrera: m.carrera,
        });
      }
    }
    return rows;
  }, [mappings, peSummary, carrera]);

  const peOptions = useMemo(() => {
    const set = new Map<string, string>();
    allRows.forEach((r) => { if (!set.has(r.pe)) set.set(r.pe, r.peDesc); });
    return [...set.entries()].sort((a, b) =>
      Number(a[0].replace(/\D/g, "")) - Number(b[0].replace(/\D/g, "")));
  }, [allRows]);

  const filtered = useMemo(() => {
    const cq = fCurso.trim().toLowerCase();
    const rq = fRA.trim().toLowerCase();
    return allRows.filter((r) => {
      if (fPE !== "Todos" && r.pe !== fPE) return false;
      if (fNivel !== "Todos" && r.nivel !== fNivel) return false;
      if (cq && !(r.cursoId.toLowerCase().includes(cq) || r.cursoNombre.toLowerCase().includes(cq))) return false;
      if (rq && !(r.raTexto.toLowerCase().includes(rq) || r.raId.toLowerCase().includes(rq))) return false;
      return true;
    });
  }, [allRows, fPE, fNivel, fCurso, fRA]);

  const activeFilters = (fPE !== "Todos" ? 1 : 0) + (fNivel !== "Todos" ? 1 : 0) + (fCurso ? 1 : 0) + (fRA ? 1 : 0);

  function clearFilters() {
    setFPE("Todos"); setFCurso(""); setFRA(""); setFNivel("Todos");
  }

  const [saved, setSaved] = useState(false);
  async function saveFilter() {
    const carreraLabel = CARRERAS.find((c) => c.code === carrera)?.label ?? carrera;
    const parts = [carreraLabel, fPE !== "Todos" ? fPE : null, fNivel !== "Todos" ? fNivel : null, fCurso || null, fRA || null].filter(Boolean);
    const label = parts.join(" · ");
    try {
      await saveFilterSnapshot(label, { carrera, pe: fPE, nivel: fNivel, curso: fCurso, ra: fRA });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  }

  function exportCSV() {
    const headers = ["Perfil de Egreso", "Descripción PE", "Curso (código)", "Curso", "Objetivo (RA)", "Texto RA", "Nivel", "Carrera"];
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(esc).join(",")];
    filtered.forEach((r) => {
      lines.push([r.pe, r.peDesc, r.cursoId, r.cursoNombre, r.raId, r.raTexto, r.nivel, r.carrera].map(esc).join(","));
    });
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trazabilidad_${carrera}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Explorador</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Relación <span className="text-[#1B2A4A]">Perfil de Egreso ↔ Curso ↔ Objetivo de aprendizaje</span>. Filtra por cualquier columna en cualquier dirección.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={saveFilter}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] rounded-md text-[12px] font-medium text-[#6B7280] hover:bg-[#F9FAFB] transition-colors"
          >
            {saved ? <><Check size={13} className="text-[#059669]" /> Guardado</> : <><Bookmark size={13} /> Guardar filtro</>}
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#111827] text-white rounded-md text-[12px] font-medium hover:bg-[#1f2937] transition-colors"
          >
            <Download size={13} /> Exportar Excel
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <Field label="Carrera">
          <select value={carrera} onChange={(e) => setCarrera(e.target.value)} className="ta-select">
            {CARRERAS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Perfil de egreso">
          <select value={fPE} onChange={(e) => setFPE(e.target.value)} className="ta-select min-w-[220px]">
            <option value="Todos">Todos los perfiles</option>
            {peOptions.map(([pe, desc]) => (
              <option key={pe} value={pe}>{pe} · {desc.slice(0, 60)}</option>
            ))}
          </select>
        </Field>
        <Field label="Nivel">
          <select value={fNivel} onChange={(e) => setFNivel(e.target.value)} className="ta-select">
            {["Todos", "Alta", "Media", "Baja"].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Curso">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input value={fCurso} onChange={(e) => setFCurso(e.target.value)} placeholder="código o nombre…" className="ta-input pl-8 w-[180px]" />
          </div>
        </Field>
        <Field label="Objetivo (RA)">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input value={fRA} onChange={(e) => setFRA(e.target.value)} placeholder="buscar texto…" className="ta-input pl-8 w-[200px]" />
          </div>
        </Field>
        {activeFilters > 0 && (
          <button onClick={clearFilters} className="flex items-center gap-1 px-2.5 py-2 text-[12px] text-[#6B7280] hover:text-[#111827]">
            <X size={13} /> Limpiar ({activeFilters})
          </button>
        )}
      </div>

      {/* Contador */}
      <p className="text-[12px] text-[#6B7280] mb-2">
        {loading ? "Cargando…" : <><span className="font-semibold text-[#111827]">{filtered.length.toLocaleString()}</span> relaciones{activeFilters > 0 ? " (filtradas)" : ""} · mostrando {Math.min(limit, filtered.length)}</>}
      </p>

      {/* Tabla */}
      <div className="border border-[#E5E7EB] rounded-xl overflow-hidden">
        <table className="w-full text-[13px]" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase" style={{ width: "28%" }}>Perfil de Egreso</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase" style={{ width: "22%" }}>Curso</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase" style={{ width: "40%" }}>Objetivo de aprendizaje</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase" style={{ width: "10%" }}>Nivel</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-12 text-[#9CA3AF]">Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-[#9CA3AF]">No hay relaciones con estos filtros</td></tr>
            ) : (
              filtered.slice(0, limit).map((r, i) => (
                <tr key={`${r.raId}-${r.pe}-${i}`} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors align-top">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[11px] text-[#1B2A4A] font-semibold">{r.pe}</span>
                    <span className="text-[#6B7280] ml-1.5">{r.peDesc}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[11px] text-[#1B2A4A]">{r.cursoId}</span>
                    <div className="text-[12px] text-[#6B7280]">{r.cursoNombre}</div>
                  </td>
                  <td className="px-4 py-2.5 text-[#111827]">{r.raTexto}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium text-white" style={{ backgroundColor: NIVEL_COLOR[r.nivel] ?? "#9CA3AF" }}>{r.nivel}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > limit && (
        <div className="flex justify-center mt-4">
          <button onClick={() => setLimit((l) => l + PAGE_SIZE)} className="px-4 py-2 text-[12px] border border-[#E5E7EB] rounded-md text-[#6B7280] hover:bg-[#F9FAFB]">
            Mostrar más ({(filtered.length - limit).toLocaleString()} restantes)
          </button>
        </div>
      )}

      <style jsx>{`
        .ta-select, .ta-input {
          height: 36px; padding: 0 10px; font-size: 13px;
          border: 1px solid #E5E7EB; border-radius: 6px; outline: none; background: #fff; color: #111827;
        }
        .ta-select:focus, .ta-input:focus { border-color: #1B2A4A; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-[#6B7280]">{label}</label>
      {children}
    </div>
  );
}
