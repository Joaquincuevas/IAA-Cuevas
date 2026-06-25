"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Download, ArrowRight, Sparkles } from "lucide-react";
import { getStats } from "@/lib/api";
import { getUser } from "@/lib/auth";

const EXPLORE_CARDS = [
  {
    tag: "IA · PRINCIPAL",
    title: "Conexiones IA",
    desc: "Propuestas IA de conexiones entre Resultados de Aprendizaje y Perfiles de Egreso. Aprueba o rechaza cada propuesta.",
    href: "/dashboard/conexiones",
  },
  {
    tag: "IA · ANÁLISIS",
    title: "Redundancia",
    desc: "Pares de objetivos de aprendizaje semánticamente similares detectados por IA, para identificar repetición curricular.",
    href: "/dashboard/redundancia",
  },
  {
    tag: "IA · CHAT",
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
    <div className="p-7 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Inicio</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Bienvenido, {user?.name ?? "usuario"} — Mallas curriculares · Universidad de los Andes
          </p>
        </div>
        <div className="flex gap-2.5">
          <button className="flex items-center gap-2 px-3.5 py-2 border border-[#E5E7EB] rounded-lg text-[13px] text-[#4B5563] hover:bg-[#F9FAFB] transition-colors">
            <RefreshCw size={14} /> Sincronizar
          </button>
          <button className="flex items-center gap-2 px-3.5 py-2 border border-[#E5E7EB] rounded-lg text-[13px] text-[#4B5563] hover:bg-[#F9FAFB] transition-colors">
            <Download size={14} /> Exportar
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        <StatCard label="CURSOS TOTALES" value={stats?.cursos ?? 139} sub="6 carreras de Ingeniería" />
        <StatCard label="OBJETIVOS DE APRENDIZAJE" value={stats?.objetivos ?? 672} sub="Resultados de aprendizaje (RA)" />
        <StatCard label="LINKS ENTRE RA" value={stats?.links ?? 924} sub="Relaciones de prerrequisito" />
        <StatCard label="CARRERAS" value={stats?.carreras ?? 6} sub="Facultad de Ingeniería" />
      </div>

      {/* Explorar */}
      <div className="mb-7">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase">Explorar</p>
          <p className="text-[11px] text-[#9CA3AF]">3 módulos</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {EXPLORE_CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="border border-[#E5E7EB] rounded-xl p-5 hover:border-[#1B2A4A]/40 hover:shadow-sm transition-all block"
            >
              <p className="text-[10px] font-semibold tracking-widest text-[#9CA3AF] uppercase mb-2">{c.tag}</p>
              <h3 className="text-[15px] font-bold text-[#111827] mb-1.5">{c.title}</h3>
              <p className="text-[13px] text-[#6B7280] leading-relaxed mb-4">{c.desc}</p>
              <span className="text-[13px] text-[#1B2A4A] font-semibold hover:underline flex items-center gap-1.5">
                Explorar <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Taula */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase mb-3">Taula</p>
        <div className="border border-[#E5E7EB] rounded-xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#F3F4F6] flex items-center justify-center flex-shrink-0">
              <Sparkles size={18} className="text-[#1B2A4A]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-[#111827]">Taula</span>
                <span className="text-[11px] font-medium text-[#059669] bg-[#ECFDF5] border border-[#10B981]/20 px-2.5 py-0.5 rounded-full">
                  Disponible
                </span>
              </div>
              <p className="text-[13px] text-[#6B7280] mt-0.5">
                Pregunta sobre la malla en lenguaje natural — análisis, brechas, comparaciones.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/taula"
            className="flex items-center gap-1.5 px-4 py-2 bg-[#111827] text-white text-[13px] font-medium rounded-lg hover:bg-[#1f2937] transition-colors flex-shrink-0"
          >
            Abrir Taula <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-xl p-5">
      <p className="text-[10px] font-semibold tracking-widest text-[#6B7280] uppercase mb-2">{label}</p>
      <p className="text-[28px] font-bold text-[#111827] leading-none mb-2 tracking-tight">{value.toLocaleString()}</p>
      <p className="text-[12px] text-[#6B7280] flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] inline-block" /> {sub}
      </p>
    </div>
  );
}
