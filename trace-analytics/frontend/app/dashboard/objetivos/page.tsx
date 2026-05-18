"use client";

import { useEffect, useState } from "react";
import { getObjectives } from "@/lib/api";

export default function ObjetivosPage() {
  const [items, setItems] = useState<{ curso: string; id_objetivo: string; descripcion: string }[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    getObjectives().then((r) => setItems(r.objectives)).catch(console.error);
  }, []);

  const filtered = items ? items.filter((it) => it.curso.toLowerCase().includes(q.toLowerCase()) || it.descripcion.toLowerCase().includes(q.toLowerCase()) || it.id_objetivo.toLowerCase().includes(q.toLowerCase())) : [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Objetivos</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">Lista de objetivos con su descripción por curso.</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar objetivo o curso..."
          className="px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-md outline-none focus:border-[#1B2A4A] transition-colors"
        />
      </div>

      <div className="border border-[#E5E7EB] rounded-xl overflow-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
              <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase">Curso</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase">ID Objetivo</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {!items ? (
              <tr><td colSpan={3} className="text-center py-12 text-[#9CA3AF] text-[13px]">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-12 text-[#9CA3AF] text-[13px]">No se encontraron objetivos</td></tr>
            ) : (
              filtered.map((it) => (
                <tr key={it.id_objetivo} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors">
                  <td className="px-4 py-3 font-mono text-[12px] text-[#1B2A4A]">{it.curso}</td>
                  <td className="px-4 py-3 text-[13px]">{it.id_objetivo}</td>
                  <td className="px-4 py-3 text-[13px]">{it.descripcion}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
