"use client";

import { useEffect, useState } from "react";
import { User, Lock, MessageSquare, Filter, Check, AlertCircle } from "lucide-react";
import { getMe, changePassword, getChatHistory, getFilterHistory } from "@/lib/api";

type Me = { email: string; name: string; role: string; last_login: string | null; actividad: { chats: number; filtros: number } };

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
  const [chats, setChats] = useState<{ role: string; content: string; created_at: string }[]>([]);
  const [filters, setFilters] = useState<{ label: string; filters: Record<string, unknown>; created_at: string }[]>([]);

  useEffect(() => {
    getMe().then(setMe).catch(console.error);
    getChatHistory().then((r) => setChats(r.messages)).catch(console.error);
    getFilterHistory().then((r) => setFilters(r.snapshots)).catch(console.error);
  }, []);

  return (
    <div className="p-10 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-[#111827] tracking-tight">Configuración</h1>
        <p className="text-[14.5px] text-[#6B7280] mt-1">Tu perfil, seguridad de la cuenta y actividad reciente.</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Perfil */}
        <section className="border border-[#E5E7EB] rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <User size={18} className="text-[#1B2A4A]" />
            <h2 className="text-[16px] font-bold text-[#111827]">Perfil</h2>
          </div>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full bg-[#1B2A4A] text-white flex items-center justify-center text-[20px] font-bold">
              {me?.name?.[0] ?? "?"}
            </div>
            <div>
              <p className="text-[18px] font-bold text-[#111827]">{me?.name ?? "…"}</p>
              <p className="text-[13px] text-[#6B7280]">{me?.email ?? ""}</p>
            </div>
          </div>
          <dl className="text-[13.5px] space-y-2.5">
            <Row k="Último ingreso" v={fmtDate(me?.last_login ?? null)} />
            <Row k="Conversaciones guardadas" v={String(me?.actividad?.chats ?? 0)} />
            <Row k="Filtros guardados" v={String(me?.actividad?.filtros ?? 0)} />
          </dl>
        </section>

        {/* Cambiar contraseña */}
        <section className="border border-[#E5E7EB] rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <Lock size={18} className="text-[#1B2A4A]" />
            <h2 className="text-[16px] font-bold text-[#111827]">Cambiar contraseña</h2>
          </div>
          <ChangePasswordForm />
        </section>

        {/* Últimas conversaciones */}
        <section className="border border-[#E5E7EB] rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <MessageSquare size={18} className="text-[#1B2A4A]" />
            <h2 className="text-[16px] font-bold text-[#111827]">Últimas conversaciones con Taula</h2>
          </div>
          {chats.length === 0 ? (
            <p className="text-[13.5px] text-[#9CA3AF]">Aún no has conversado con la IA.</p>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-auto">
              {chats.slice(-8).reverse().map((m, i) => (
                <div key={i} className="text-[13.5px] leading-relaxed">
                  <span className={`font-semibold ${m.role === "user" ? "text-[#1B2A4A]" : "text-[#6B7280]"}`}>
                    {m.role === "user" ? "Tú" : "Taula"}:
                  </span>{" "}
                  <span className="text-[#374151]">{m.content.slice(0, 140)}{m.content.length > 140 ? "…" : ""}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Filtros guardados */}
        <section className="border border-[#E5E7EB] rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <Filter size={18} className="text-[#1B2A4A]" />
            <h2 className="text-[16px] font-bold text-[#111827]">Filtros guardados</h2>
          </div>
          {filters.length === 0 ? (
            <p className="text-[13.5px] text-[#9CA3AF]">No has guardado filtros del Explorador.</p>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-auto">
              {filters.map((f, i) => (
                <div key={i} className="text-[13.5px] border border-[#F3F4F6] rounded-lg px-4 py-3">
                  <p className="text-[#111827] font-medium">{f.label || "Filtro sin nombre"}</p>
                  <p className="text-[#9CA3AF] text-[12px] mt-0.5">{fmtDate(f.created_at)}</p>
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
    <div className="flex justify-between border-b border-[#F3F4F6] pb-2">
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

  const inputCls = "w-full h-10 px-3 text-[14px] border border-[#E5E7EB] rounded-lg outline-none focus:border-[#1B2A4A] transition-colors";

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div>
        <label className="text-[12.5px] font-semibold text-[#6B7280] block mb-1.5">Contraseña actual</label>
        <input type="password" value={oldp} onChange={(e) => setOld(e.target.value)} className={inputCls} required />
      </div>
      <div>
        <label className="text-[12.5px] font-semibold text-[#6B7280] block mb-1.5">Nueva contraseña</label>
        <input type="password" value={newp} onChange={(e) => setNew(e.target.value)} className={inputCls} required />
      </div>
      <div>
        <label className="text-[12.5px] font-semibold text-[#6B7280] block mb-1.5">Repetir nueva contraseña</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} required />
      </div>
      {status && (
        <div className={`flex items-center gap-1.5 text-[13px] ${status.ok ? "text-[#059669]" : "text-[#DC2626]"}`}>
          {status.ok ? <Check size={15} /> : <AlertCircle size={15} />} {status.msg}
        </div>
      )}
      <button type="submit" disabled={busy} className="w-full h-10 bg-[#111827] text-white text-[14px] font-medium rounded-lg hover:bg-[#1f2937] transition-colors disabled:opacity-50">
        {busy ? "Guardando…" : "Actualizar contraseña"}
      </button>
    </form>
  );
}
