"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Home, GitMerge, GitBranch, Sparkles, Plus, Settings } from "lucide-react";
import { isAuthenticated, getUser, clearAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard",             label: "Inicio",        icon: Home },
  { href: "/dashboard/conexiones",  label: "Conexiones IA", icon: GitMerge },
  { href: "/dashboard/redundancia", label: "Redundancia",   icon: GitBranch },
  { href: "/dashboard/taula",       label: "Taula",         icon: Sparkles, badge: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
  }, [router]);

  function handleLogout() {
    clearAuth();
    router.replace("/login");
    if (typeof window !== "undefined") window.location.reload();
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <aside className="w-[200px] flex-shrink-0 flex flex-col border-r border-[#E5E7EB] py-5 px-3 h-full">
        <div className="mb-6 px-2">
          <p className="text-[14px] font-bold text-[#111827] leading-tight tracking-tight">Trace Analytics</p>
          <p className="text-[11px] text-[#9CA3AF] mt-0.5">powered by Taula</p>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map(({ href, label, icon: Icon, badge }) => {
            const isActive =
              href === "/dashboard" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
                  isActive
                    ? "font-semibold text-white bg-[#1B2A4A]"
                    : "text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={16} />
                  {label}
                </span>
                {badge && (
                  <Plus size={12} className={isActive ? "text-white/70" : "text-[#9CA3AF]"} />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#E5E7EB] pt-3 mt-3">
          <Link
            href="/dashboard/configuracion"
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors mb-2.5 ${
              pathname.startsWith("/dashboard/configuracion")
                ? "font-semibold text-white bg-[#1B2A4A]"
                : "text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]"
            }`}
          >
            <Settings size={16} /> Configuración
          </Link>
          <div className="px-2.5">
            <p className="text-[13px] font-semibold text-[#111827] truncate leading-tight">{user.name}</p>
            <p className="text-[11px] text-[#9CA3AF] truncate mb-1">{user.email}</p>
            <button
              onClick={handleLogout}
              className="text-[12px] text-red-500 hover:text-red-600 font-medium transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto h-full">{children}</main>
    </div>
  );
}
