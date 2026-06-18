"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Download, ArrowRight, Sparkles } from "lucide-react";
import { getStats } from "@/lib/api";
import { getUser } from "@/lib/auth";

const EXPLORE_CARDS = [
  {
    tag: "PRINCIPAL",
    title: "Explorador",
    desc: "Relación Perfil de Egreso ↔ Curso ↔ Objetivo de aprendizaje. Filtra por cualquier dimensión y exporta a Excel.",
    href: "/dashboard/explorador",
  },
  {
    tag: "ANÁLISIS",
    title: "Redundancia",
    desc: "Objetivos de aprendizaje semánticamente similares entre cursos, para detectar repetición sin progresión.",
    href: "/dashboard/redundancia",
  },
  {
    tag: "IA",
    title: "Taula",
    desc: "Pregunta sobre la malla en lenguaje natural — análisis, brechas y comparaciones.",
    href: "/dashboard/taula",
  },
];

export default function DashboardPage() {
  const user = getUser();
  const [stats, setStats] = useState<{ cursos: number; objetivos: number; links: number; carreras: number } | null>(null);

  useEffect(() => {
    getStats().then(setStats).catch(console.error);
  }, []);

  return (
    <div className="p-10 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-[30px] font-bold text-[#111827] tracking-tight">Inicio</h1>
          <p className="text-[15px] text-[#6B7280] mt-1">
            Bienvenido, {user?.name ?? "usuario"} — Mallas curriculares · Universidad de los Andes
          </p>
        </div>
        <div className="flex gap-2.5">
          <button className="flex items-center gap-2 px-4 py-2.5 border border-[#E5E7EB] rounded-lg text-[13.5px] text-[#4B5563] hover:bg-[#F9FAFB] transition-colors">
            <RefreshCw size={15} /> Sincronizar
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 border border-[#E5E7EB] rounded-lg text-[13.5px] text-[#4B5563] hover:bg-[#F9FAFB] transition-colors">
            <Download size={15} /> Exportar
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-5 mb-12">
        <StatCard label="CURSOS TOTALES" value={stats?.cursos ?? 139} sub="6 carreras de Ingeniería" />
        <StatCard label="OBJETIVOS DE APRENDIZAJE" value={stats?.objetivos ?? 672} sub="Resultados de aprendizaje (RA)" />
        <StatCard label="LINKS ENTRE RA" value={stats?.links ?? 924} sub="Relaciones de prerrequisito" />
        <StatCard label="CARRERAS" value={stats?.carreras ?? 6} sub="Facultad de Ingeniería" />
      </div>

      {/* Explorar */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] font-semibold tracking-widest text-[#6B7280] uppercase">Explorar</p>
          <p className="text-[12px] text-[#9CA3AF]">3 módulos</p>
        </div>
        <div className="grid grid-cols-3 gap-5">
          {EXPLORE_CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="border border-[#E5E7EB] rounded-2xl p-6 hover:border-[#1B2A4A]/40 hover:shadow-sm transition-all block"
            >
              <p className="text-[11px] font-semibold tracking-widest text-[#9CA3AF] uppercase mb-2.5">{c.tag}</p>
              <h3 className="text-[18px] font-bold text-[#111827] mb-2.5">{c.title}</h3>
              <p className="text-[14px] text-[#6B7280] leading-relaxed mb-5">{c.desc}</p>
              <span className="text-[13.5px] text-[#1B2A4A] font-semibold hover:underline flex items-center gap-1.5">
                Explorar <ArrowRight size={15} />
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Taula */}
      <div className="mb-10">
        <p className="text-[12px] font-semibold tracking-widest text-[#6B7280] uppercase mb-4">Taula</p>
        <div className="border border-[#E5E7EB] rounded-2xl p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#F3F4F6] flex items-center justify-center flex-shrink-0">
              <Sparkles size={22} className="text-[#1B2A4A]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-[17px] font-bold text-[#111827]">Taula</span>
                <span className="text-[11.5px] font-medium text-[#059669] bg-[#ECFDF5] border border-[#10B981]/20 px-2.5 py-0.5 rounded-full">
                  Disponible
                </span>
              </div>
              <p className="text-[14px] text-[#6B7280] mt-1">
                Pregunta sobre la malla en lenguaje natural — análisis, brechas, comparaciones.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/taula"
            className="flex items-center gap-2 px-5 py-3 bg-[#111827] text-white text-[14px] font-medium rounded-xl hover:bg-[#1f2937] transition-colors flex-shrink-0"
          >
            Abrir Taula <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-2xl p-6">
      <p className="text-[11.5px] font-semibold tracking-widest text-[#6B7280] uppercase mb-3">{label}</p>
      <p className="text-[40px] font-bold text-[#111827] leading-none mb-3 tracking-tight">{value.toLocaleString()}</p>
      <p className="text-[13px] text-[#6B7280] flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] inline-block" /> {sub}
      </p>
    </div>
  );
}
