"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Table2, GitBranch, Sparkles, Plus, Settings } from "lucide-react";
import { isAuthenticated, getUser, clearAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/dashboard/explorador", label: "Explorador", icon: Table2 },
  { href: "/dashboard/redundancia", label: "Redundancia", icon: GitBranch },
  { href: "/dashboard/taula", label: "Taula", icon: Sparkles, badge: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);

  // Ancho ajustable del sidebar (arrastrando el borde derecho), persistido.
  const MIN_W = 200, MAX_W = 440;
  const [width, setWidth] = useState(248);
  const widthRef = useRef(248);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
  }, [router]);

  useEffect(() => {
    const saved = parseInt(localStorage.getItem("trace_sidebar_w") || "");
    if (!isNaN(saved)) {
      const w = Math.min(MAX_W, Math.max(MIN_W, saved));
      widthRef.current = w;
      setWidth(w);
    }
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const w = Math.min(MAX_W, Math.max(MIN_W, e.clientX));
      widthRef.current = w;
      setWidth(w);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      localStorage.setItem("trace_sidebar_w", String(widthRef.current));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function startDrag() {
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function handleLogout() {
    clearAuth();
    router.replace("/login");
    if (typeof window !== "undefined") window.location.reload();
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <aside
        style={{ width }}
        className="relative flex-shrink-0 flex flex-col border-r border-[#E5E7EB] py-6 px-4 h-full"
      >
        <div className="mb-8 px-1">
          <p className="text-[19px] font-bold text-[#111827] leading-tight tracking-tight">Trace Analytics</p>
          <p className="text-[12px] text-[#9CA3AF] mt-1">powered by Taula</p>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map(({ href, label, icon: Icon, badge }) => {
            const isActive =
              href === "/dashboard" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[14.5px] transition-colors ${
                  isActive
                    ? "font-semibold text-white bg-[#1B2A4A]"
                    : "text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon size={18} />
                  {label}
                </span>
                {badge && (
                  <Plus size={14} className={isActive ? "text-white/70" : "text-[#9CA3AF]"} />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#E5E7EB] pt-3 mt-3">
          <Link
            href="/dashboard/configuracion"
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14.5px] transition-colors mb-3 ${
              pathname.startsWith("/dashboard/configuracion")
                ? "font-semibold text-white bg-[#1B2A4A]"
                : "text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]"
            }`}
          >
            <Settings size={18} /> Configuración
          </Link>
          <div className="flex items-center gap-3 px-1">
            <div className="w-9 h-9 rounded-full bg-[#1B2A4A] text-white flex items-center justify-center text-[14px] font-semibold flex-shrink-0">
              {user.name?.[0] ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-[#111827] truncate leading-tight">{user.name}</p>
              <button
                onClick={handleLogout}
                className="text-[12px] text-red-500 hover:text-red-600 font-medium transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>

        {/* Tirador para ajustar el ancho del sidebar */}
        <div
          onMouseDown={startDrag}
          title="Arrastra para ajustar el ancho"
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[#1B2A4A]/15 active:bg-[#1B2A4A]/25 transition-colors"
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto h-full">{children}</main>
    </div>
  );
}
