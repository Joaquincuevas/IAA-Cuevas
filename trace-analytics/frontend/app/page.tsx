import Link from "next/link";
import AnimatedGraph from "@/components/AnimatedGraph";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
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
      <main className="flex-1 flex items-center justify-center px-10">
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
              <button className="px-5 py-2.5 border border-[#E5E7EB] text-[#111827] text-[13px] font-medium rounded-lg hover:bg-[#F9FAFB] transition-colors">
                Conocer más
              </button>
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
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between px-10 py-4 border-t border-[#E5E7EB]">
        <span className="text-[11px] text-[#9CA3AF]">
          © 2026 Facultad de Ingeniería · Universidad de los Andes
        </span>
        <span className="text-[11px] text-[#9CA3AF]">v0.4 · Beta interna</span>
      </footer>
    </div>
  );
}
