"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { login } from "@/lib/api";
import { saveAuth, isAuthenticated } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login(email, password);
      saveAuth(res.token, res.user);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Back link */}
      <div className="p-5">
        <Link href="/" className="text-[13px] text-[#6B7280] hover:text-[#111827] transition-colors">
          ← Volver
        </Link>
      </div>

      {/* Form centered */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md px-6">
          <div className="text-center mb-8">
            <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Trace Analytics</h1>
            <p className="text-[12px] text-[#9CA3AF] mt-1">Facultad de Ingeniería · U. de los Andes</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <input
              type="email"
              placeholder="usuario@miuandes.cl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 text-[14px] border border-[#E5E7EB] rounded-lg outline-none focus:border-[#1B2A4A] focus:ring-2 focus:ring-[#1B2A4A]/10 transition-all"
            />

            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 pr-11 text-[14px] border border-[#E5E7EB] rounded-lg outline-none focus:border-[#1B2A4A] focus:ring-2 focus:ring-[#1B2A4A]/10 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <p className="text-[12px] text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-1 bg-[#111827] text-white text-[14px] font-medium rounded-lg hover:bg-[#1f2937] disabled:opacity-60 transition-colors"
            >
              {loading ? "Iniciando sesión…" : "Iniciar sesión"}
            </button>
          </form>

          <p className="text-center text-[11px] text-[#9CA3AF] mt-8">
            Facultad de Ingeniería · Universidad de los Andes
          </p>
        </div>
      </div>
    </div>
  );
}
