"use client";

import { useEffect, useState } from "react";
import { User, Lock, Filter, Check, AlertCircle } from "lucide-react";
import { getMe, changePassword, getFilterHistory } from "@/lib/api";

type Me = { email: string; name: string; role: string; last_login: string | null; actividad: { filtros: number } };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
    return d.toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function ConfiguracionPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [filters, setFilters] = useState<{ label: string; filters: Record<string, unknown>; created_at: string }[]>([]);

  useEffect(() => {
    getMe().then(setMe).catch(console.error);
    getFilterHistory().then((r) => setFilters(r.snapshots)).catch(console.error);
  }, []);

  return (
    <div className="p-7 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Configuración</h1>
        <p className="text-[13px] text-[#6B7280] mt-0.5">Tu perfil, seguridad de la cuenta y actividad reciente.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Perfil */}
        <section className="border border-[#E5E7EB] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={15} className="text-[#1B2A4A]" />
            <h2 className="text-[14px] font-bold text-[#111827]">Perfil</h2>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-[#1B2A4A] text-white flex items-center justify-center text-[15px] font-bold">
              {me?.name?.[0] ?? "?"}
            </div>
            <div>
              <p className="text-[15px] font-bold text-[#111827]">{me?.name ?? "…"}</p>
              <p className="text-[12px] text-[#6B7280]">{me?.email ?? ""}</p>
            </div>
          </div>
          <dl className="text-[12px] space-y-2">
            <Row k="Último ingreso" v={fmtDate(me?.last_login ?? null)} />
            <Row k="Filtros guardados" v={String(me?.actividad?.filtros ?? 0)} />
          </dl>
        </section>

        {/* Cambiar contraseña */}
        <section className="border border-[#E5E7EB] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={15} className="text-[#1B2A4A]" />
            <h2 className="text-[14px] font-bold text-[#111827]">Cambiar contraseña</h2>
          </div>
          <ChangePasswordForm />
        </section>

        {/* Filtros guardados */}
        <section className="border border-[#E5E7EB] rounded-xl p-5 col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={15} className="text-[#1B2A4A]" />
            <h2 className="text-[14px] font-bold text-[#111827]">Filtros guardados</h2>
          </div>
          {filters.length === 0 ? (
            <p className="text-[12px] text-[#9CA3AF]">No has guardado filtros del Explorador.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {filters.map((f, i) => (
                <div key={i} className="text-[12px] border border-[#F3F4F6] rounded-md px-3 py-2">
                  <p className="text-[#111827] font-medium">{f.label || "Filtro sin nombre"}</p>
                  <p className="text-[#9CA3AF] text-[11px]">{fmtDate(f.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-[#F3F4F6] pb-1.5">
      <dt className="text-[#6B7280]">{k}</dt>
      <dd className="text-[#111827] font-medium">{v}</dd>
    </div>
  );
}

function ChangePasswordForm() {
  const [oldp, setOld] = useState("");
  const [newp, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (newp.length < 8) { setStatus({ ok: false, msg: "La nueva contraseña debe tener al menos 8 caracteres." }); return; }
    if (newp !== confirm) { setStatus({ ok: false, msg: "Las contraseñas nuevas no coinciden." }); return; }
    setBusy(true);
    try {
      const r = await changePassword(oldp, newp);
      setStatus({ ok: true, msg: r.message });
      setOld(""); setNew(""); setConfirm("");
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Error al cambiar la contraseña." });
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full h-9 px-3 text-[13px] border border-[#E5E7EB] rounded-md outline-none focus:border-[#1B2A4A] transition-colors";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-[11px] font-semibold text-[#6B7280] block mb-1">Contraseña actual</label>
        <input type="password" value={oldp} onChange={(e) => setOld(e.target.value)} className={inputCls} required />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-[#6B7280] block mb-1">Nueva contraseña</label>
        <input type="password" value={newp} onChange={(e) => setNew(e.target.value)} className={inputCls} required />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-[#6B7280] block mb-1">Repetir nueva contraseña</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} required />
      </div>
      {status && (
        <div className={`flex items-center gap-1.5 text-[12px] ${status.ok ? "text-[#059669]" : "text-[#DC2626]"}`}>
          {status.ok ? <Check size={13} /> : <AlertCircle size={13} />} {status.msg}
        </div>
      )}
      <button type="submit" disabled={busy} className="w-full h-9 bg-[#111827] text-white text-[13px] font-medium rounded-md hover:bg-[#1f2937] transition-colors disabled:opacity-50">
        {busy ? "Guardando…" : "Actualizar contraseña"}
      </button>
    </form>
  );
}
