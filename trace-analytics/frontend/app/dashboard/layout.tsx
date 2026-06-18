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
  const MIN_W = 140, MAX_W = 380;
  const [width, setWidth] = useState(170);
  const widthRef = useRef(170);
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
        className="relative flex-shrink-0 flex flex-col border-r border-[#E5E7EB] py-5 px-3 h-full"
      >
        <div className="mb-6 px-2">
          <p className="text-[12px] font-bold text-[#111827] leading-tight">Trace Analytics</p>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">powered by Taula</p>
        </div>

        <nav className="flex flex-col gap-0.5 flex-1">
          {NAV.map(({ href, label, icon: Icon, badge }) => {
            const isActive =
              href === "/dashboard" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors ${
                  isActive
                    ? "font-bold text-[#111827] border-l-2 border-[#1B2A4A] pl-[6px]"
                    : "text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB]"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Icon size={13} />
                  {label}
                </span>
                {badge && (
                  <Plus size={11} className="text-[#9CA3AF]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#E5E7EB] pt-2 mt-3">
          <Link
            href="/dashboard/configuracion"
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] transition-colors mb-2 ${
              pathname.startsWith("/dashboard/configuracion")
                ? "font-bold text-[#111827] border-l-2 border-[#1B2A4A] pl-[6px]"
                : "text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB]"
            }`}
          >
            <Settings size={13} /> Configuración
          </Link>
          <div className="px-2">
            <p className="text-[10px] text-[#9CA3AF] truncate mb-1">{user.email}</p>
            <button
              onClick={handleLogout}
              className="text-[11px] text-red-500 hover:text-red-600 font-medium transition-colors"
            >
              Cerrar sesión
            </button>
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
