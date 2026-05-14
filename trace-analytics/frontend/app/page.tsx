import Link from "next/link";

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

          {/* Decorative graph */}
          <div className="flex-shrink-0 w-80 h-64 relative opacity-60">
            <svg width="320" height="260" viewBox="0 0 320 260" className="w-full h-full">
              {/* Edges */}
              <line x1="160" y1="130" x2="60" y2="60" stroke="#E5E7EB" strokeWidth="1.5" />
              <line x1="160" y1="130" x2="260" y2="60" stroke="#E5E7EB" strokeWidth="1.5" />
              <line x1="160" y1="130" x2="60" y2="200" stroke="#E5E7EB" strokeWidth="1.5" />
              <line x1="160" y1="130" x2="260" y2="200" stroke="#E5E7EB" strokeWidth="1.5" />
              <line x1="60" y1="60" x2="20" y2="130" stroke="#E5E7EB" strokeWidth="1" />
              <line x1="260" y1="60" x2="300" y2="130" stroke="#E5E7EB" strokeWidth="1" />
              <line x1="60" y1="200" x2="20" y2="130" stroke="#E5E7EB" strokeWidth="1" />
              <line x1="260" y1="200" x2="300" y2="130" stroke="#E5E7EB" strokeWidth="1" />
              <line x1="60" y1="60" x2="160" y2="20" stroke="#E5E7EB" strokeWidth="1" />
              <line x1="260" y1="60" x2="160" y2="20" stroke="#E5E7EB" strokeWidth="1" />
              {/* Nodes */}
              <circle cx="160" cy="130" r="8" fill="#1B2A4A" />
              <circle cx="60" cy="60" r="6" fill="#243B6E" />
              <circle cx="260" cy="60" r="6" fill="#243B6E" />
              <circle cx="60" cy="200" r="6" fill="#243B6E" />
              <circle cx="260" cy="200" r="6" fill="#243B6E" />
              <circle cx="20" cy="130" r="4" fill="#3B6DC1" />
              <circle cx="300" cy="130" r="4" fill="#3B6DC1" />
              <circle cx="160" cy="20" r="4" fill="#3B6DC1" />
              <circle cx="110" cy="170" r="3" fill="#6B8EB8" />
              <circle cx="210" cy="90" r="3" fill="#6B8EB8" />
              <circle cx="200" cy="170" r="3" fill="#6B8EB8" />
            </svg>
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
