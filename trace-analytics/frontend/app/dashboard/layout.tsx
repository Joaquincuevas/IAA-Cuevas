"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Network, BookOpen, GitBranch, Sparkles, Plus } from "lucide-react";
import { isAuthenticated, getUser, clearAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/dashboard/conexiones", label: "Conexiones", icon: Network },
    { href: "/dashboard/cobertura", label: "Cobertura", icon: BookOpen },
    { href: "/dashboard/objetivos", label: "Objetivos", icon: BookOpen },
    { href: "/dashboard/trazabilidad", label: "Trazabilidad", icon: GitBranch },
  { href: "/dashboard/redundancia", label: "Redundancia", icon: GitBranch },
  { href: "/dashboard/taula", label: "Taula", icon: Sparkles, badge: true },
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
    <div className="flex min-h-screen bg-white">
      {/* Sidebar */}
      <aside className="w-[150px] flex-shrink-0 flex flex-col border-r border-[#E5E7EB] py-5 px-3">
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

        <div className="border-t border-[#E5E7EB] pt-3 px-2 mt-3">
          <p className="text-[10px] text-[#9CA3AF] truncate mb-1">{user.email}</p>
          <button
            onClick={handleLogout}
            className="text-[11px] text-red-500 hover:text-red-600 font-medium transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
