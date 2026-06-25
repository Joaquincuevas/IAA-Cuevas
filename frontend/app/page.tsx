import Link from "next/link";
import AnimatedGraph from "@/components/AnimatedGraph";
import CurriculumFlow from "@/components/CurriculumFlow";

export default function LandingPage() {
  return (
    <div className="flex flex-col bg-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-10 py-5 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-[#111827]">Trace Analytics</span>
          <span className="text-[#6B7280] text-[12px]">·</span>
          <span className="text-[#6B7280] text-[12px]">Universidad de los Andes · Facultad de Ingeniería</span>
        </div>
        <Link
          href="/login"
          className="text-[13px] font-medium text-[#111827] hover:text-[#1B2A4A] transition-colors"
        >
          Iniciar sesión →
        </Link>
      </nav>

      {/* Hero */}
      <section className="min-h-screen flex items-center justify-center px-10">
        <div className="w-full max-w-6xl flex items-center justify-between gap-16">
          {/* Text */}
          <div className="flex-1 max-w-xl">
            <p className="text-[11px] font-semibold tracking-widest text-[#6B7280] uppercase mb-4">
              Trace Analytics · Universidad de los Andes
            </p>
            <h1 className="text-[44px] font-extrabold leading-[1.1] text-[#111827] mb-5">
              Inteligencia curricular para la Facultad de Ingeniería.
            </h1>
            <p className="text-[15px] text-[#6B7280] leading-relaxed mb-8">
              Analiza la malla, detecta brechas y entiende cómo los resultados de aprendizaje
              construyen el perfil de egreso.
            </p>
            <div className="flex items-center gap-3 mb-10">
              <Link
                href="/login"
                className="px-5 py-2.5 bg-[#111827] text-white text-[13px] font-medium rounded-lg hover:bg-[#1f2937] transition-colors"
              >
                Iniciar sesión
              </Link>
              <a
                href="#conocer-mas"
                className="px-5 py-2.5 border border-[#E5E7EB] text-[#111827] text-[13px] font-medium rounded-lg hover:bg-[#F9FAFB] transition-colors"
              >
                Conocer más
              </a>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#6B7280]">
              <span><span className="font-semibold text-[#111827]">139</span> cursos</span>
              <span>·</span>
              <span><span className="font-semibold text-[#111827]">672</span> objetivos de aprendizaje</span>
              <span>·</span>
              <span><span className="font-semibold text-[#111827]">6</span> carreras</span>
            </div>
          </div>

          {/* Animated graph */}
          <div className="flex-shrink-0 w-[520px] h-[520px] relative">
            <AnimatedGraph />
          </div>
        </div>
      </section>

      {/* ── Conocer más section ── */}
      <section id="conocer-mas" className="bg-[#0A0F1E] py-24 px-10">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="text-center mb-16">
            <p className="text-[11px] font-semibold tracking-widest text-blue-400/70 uppercase mb-3">
              Cómo funciona
            </p>
            <h2 className="text-[36px] font-extrabold text-white leading-tight mb-4">
              De los cursos al Perfil de Egreso,<br />
              <span className="text-white/50">en tiempo real.</span>
            </h2>
            <p className="text-[15px] text-white/40 max-w-xl mx-auto leading-relaxed">
              Trace Analytics cruza tres fuentes de datos — mallas curriculares, resultados de
              aprendizaje y matrices de tributación — para dar visibilidad total sobre la
              formación de ingenieros.
            </p>
          </div>

          {/* Flow animation */}
          <div className="mb-16">
            <CurriculumFlow />
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-3 gap-5">
            {[
              {
                tag: "Módulo 01",
                title: "Cobertura del PE",
                desc: "Visualiza qué porcentaje del Perfil de Egreso está cubierto por cada carrera, desglosado por semestre y nivel de dominio (Alta / Media / Baja).",
                color: "border-white/10",
              },
              {
                tag: "Módulo 02",
                title: "Trazabilidad RA → PE",
                desc: "Mapea exactamente qué Resultados de Aprendizaje construyen cada competencia. Detecta PEs sin cobertura Alta antes de que sean un problema.",
                color: "border-blue-500/30",
              },
              {
                tag: "Módulo 03",
                title: "Redundancia curricular",
                desc: "Identifica RAs que se repiten en múltiples cursos sin progresar de nivel, señal de ineficiencia en el diseño curricular.",
                color: "border-white/10",
              },
            ].map((card) => (
              <div
                key={card.tag}
                className={`rounded-xl border ${card.color} bg-white/[0.03] p-6 hover:bg-white/[0.06] transition-colors`}
              >
                <p className="text-[10px] font-semibold tracking-widest text-blue-400/60 uppercase mb-3">
                  {card.tag}
                </p>
                <h3 className="text-[16px] font-bold text-white mb-2">{card.title}</h3>
                <p className="text-[13px] text-white/40 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center mt-14">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3 bg-white text-[#0A0F1E] text-[13px] font-bold rounded-lg hover:bg-white/90 transition-colors"
            >
              Acceder a la plataforma →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex items-center justify-between px-10 py-4 border-t border-[#E5E7EB] bg-white">
        <span className="text-[11px] text-[#9CA3AF]">
          © 2026 Facultad de Ingeniería · Universidad de los Andes
        </span>
        <span className="text-[11px] text-[#9CA3AF]">v0.4 · Beta interna</span>
      </footer>
    </div>
  );
}
