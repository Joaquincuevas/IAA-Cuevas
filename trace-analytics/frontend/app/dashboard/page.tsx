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
    <div className="p-9 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-9">
        <div>
          <h1 className="text-[26px] font-bold text-[#111827] tracking-tight">Inicio</h1>
          <p className="text-[14px] text-[#6B7280] mt-1">
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
      <div className="grid grid-cols-4 gap-5 mb-10">
        <StatCard label="CURSOS TOTALES" value={stats?.cursos ?? 139} sub="6 carreras de Ingeniería" />
        <StatCard label="OBJETIVOS DE APRENDIZAJE" value={stats?.objetivos ?? 672} sub="Resultados de aprendizaje (RA)" />
        <StatCard label="LINKS ENTRE RA" value={stats?.links ?? 924} sub="Relaciones de prerrequisito" />
        <StatCard label="CARRERAS" value={stats?.carreras ?? 6} sub="Facultad de Ingeniería" />
      </div>

      {/* Explorar */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11.5px] font-semibold tracking-widest text-[#6B7280] uppercase">Explorar</p>
          <p className="text-[11.5px] text-[#9CA3AF]">3 módulos</p>
        </div>
        <div className="grid grid-cols-3 gap-5">
          {EXPLORE_CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="border border-[#E5E7EB] rounded-2xl p-6 hover:border-[#1B2A4A]/40 hover:shadow-sm transition-all block"
            >
              <p className="text-[11px] font-semibold tracking-widest text-[#9CA3AF] uppercase mb-2.5">{c.tag}</p>
              <h3 className="text-[16px] font-bold text-[#111827] mb-2">{c.title}</h3>
              <p className="text-[13.5px] text-[#6B7280] leading-relaxed mb-5">{c.desc}</p>
              <span className="text-[13px] text-[#1B2A4A] font-semibold hover:underline flex items-center gap-1.5">
                Explorar <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Taula */}
      <div className="mb-9">
        <p className="text-[11.5px] font-semibold tracking-widest text-[#6B7280] uppercase mb-4">Taula</p>
        <div className="border border-[#E5E7EB] rounded-2xl p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-[#F3F4F6] flex items-center justify-center flex-shrink-0">
              <Sparkles size={20} className="text-[#1B2A4A]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-[16px] font-bold text-[#111827]">Taula</span>
                <span className="text-[11px] font-medium text-[#059669] bg-[#ECFDF5] border border-[#10B981]/20 px-2.5 py-0.5 rounded-full">
                  Disponible
                </span>
              </div>
              <p className="text-[13.5px] text-[#6B7280] mt-1">
                Pregunta sobre la malla en lenguaje natural — análisis, brechas, comparaciones.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/taula"
            className="flex items-center gap-2 px-5 py-2.5 bg-[#111827] text-white text-[14px] font-medium rounded-xl hover:bg-[#1f2937] transition-colors flex-shrink-0"
          >
            Abrir Taula <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-2xl p-6">
      <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase mb-2.5">{label}</p>
      <p className="text-[34px] font-bold text-[#111827] leading-none mb-2.5 tracking-tight">{value.toLocaleString()}</p>
      <p className="text-[12.5px] text-[#6B7280] flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] inline-block" /> {sub}
      </p>
    </div>
  );
}
