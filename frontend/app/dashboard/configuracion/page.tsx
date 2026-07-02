"use client";

import { useEffect, useRef, useState } from "react";
import { User, Lock, Check, AlertCircle, FileSpreadsheet, Upload, Trash2 } from "lucide-react";
import {
  getMe, changePassword,
  getMatrices, uploadMatriz, deleteMatriz, type MatrizInfo,
} from "@/lib/api";
import SyncButton from "@/components/SyncButton";

type Me = { email: string; name: string; role: string; last_login: string | null };

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
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    getMe().then(setMe).catch(console.error);
  }, [refreshKey]);

  return (
    <div className="p-7 max-w-5xl">
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Configuración</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">Tu perfil y seguridad de la cuenta.</p>
        </div>
        <SyncButton
          onSync={async () => {
            setRefreshKey((k) => k + 1);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
          </dl>
        </section>

        <section className="border border-[#E5E7EB] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={15} className="text-[#1B2A4A]" />
            <h2 className="text-[14px] font-bold text-[#111827]">Cambiar contraseña</h2>
          </div>
          <ChangePasswordForm />
        </section>

        <div className="col-span-2">
          <PlanillasSection key={refreshKey} />
        </div>
      </div>
    </div>
  );
}

function PlanillasSection() {
  const [matrices, setMatrices] = useState<MatrizInfo[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function refresh() {
    getMatrices().then((r) => setMatrices(r.matrices)).catch(console.error);
  }

  useEffect(() => { refresh(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (!file) { setStatus({ ok: false, msg: "Selecciona un archivo Excel (.xlsx)." }); return; }
    if (!/^[A-Za-z]{2,5}$/.test(codigo.trim())) {
      setStatus({ ok: false, msg: "Código de carrera inválido: usa 2–5 letras (ej: ICQ)." });
      return;
    }
    setBusy(true);
    try {
      const r = await uploadMatriz(file, codigo.trim().toUpperCase(), nombre.trim());
      setStatus({ ok: true, msg: `${r.message} · ${r.matriz.n_cursos} cursos, ${r.matriz.n_tributaciones} tributaciones, ${r.matriz.n_competencias} competencias.` });
      setFile(null); setCodigo(""); setNombre("");
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Error al subir la planilla." });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(carrera: string) {
    if (!window.confirm(`¿Eliminar la planilla ${carrera}? Sus cursos y tributaciones dejarán de estar disponibles.`)) return;
    setDeleting(carrera);
    setStatus(null);
    try {
      const r = await deleteMatriz(carrera);
      setStatus({ ok: true, msg: r.message });
      refresh();
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Error al eliminar." });
    } finally {
      setDeleting(null);
    }
  }

  const inputCls = "h-9 px-3 text-[13px] border border-[#E5E7EB] rounded-md outline-none focus:border-[#1B2A4A] transition-colors";

  return (
    <section className="border border-[#E5E7EB] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <FileSpreadsheet size={15} className="text-[#1B2A4A]" />
        <h2 className="text-[14px] font-bold text-[#111827]">Planillas de tributación</h2>
      </div>
      <p className="text-[12px] text-[#6B7280] mb-4">
        Matrices PE/APE por carrera. Las planillas subidas quedan disponibles de inmediato para cobertura y análisis IA.
      </p>

      {/* Lista */}
      <div className="border border-[#F3F4F6] rounded-lg overflow-hidden mb-5">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-[#6B7280]">
              <th className="px-3 py-2 font-semibold">Carrera</th>
              <th className="px-3 py-2 font-semibold">Nombre</th>
              <th className="px-3 py-2 font-semibold">Origen</th>
              <th className="px-3 py-2 font-semibold text-right">Cursos</th>
              <th className="px-3 py-2 font-semibold text-right">Tributaciones</th>
              <th className="px-3 py-2 font-semibold text-right">Competencias</th>
              <th className="px-3 py-2 font-semibold">Subida</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {matrices.map((m) => (
              <tr key={m.carrera} className="border-t border-[#F3F4F6]">
                <td className="px-3 py-2 font-semibold text-[#111827]">{m.carrera}</td>
                <td className="px-3 py-2 text-[#111827]">{m.nombre}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    m.origen === "base" ? "bg-[#F3F4F6] text-[#6B7280]" : "bg-[#1B2A4A] text-white"
                  }`}>
                    {m.origen === "base" ? "Base" : "Subida"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-[#111827]">{m.n_cursos}</td>
                <td className="px-3 py-2 text-right text-[#111827]">{m.n_tributaciones}</td>
                <td className="px-3 py-2 text-right text-[#111827]">{m.n_competencias}</td>
                <td className="px-3 py-2 text-[#6B7280]">
                  {m.origen === "subida" ? `${fmtDate(m.uploaded_at)} · ${m.uploaded_by ?? ""}` : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {m.origen === "subida" && (
                    <button
                      onClick={() => handleDelete(m.carrera)}
                      disabled={deleting === m.carrera}
                      className="text-[#DC2626] hover:text-[#B91C1C] disabled:opacity-40 transition-colors"
                      title="Eliminar planilla"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {matrices.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-[#9CA3AF]">Cargando planillas…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Upload */}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-[11px] font-semibold text-[#6B7280] mb-1">Archivo Excel (.xlsx)</label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[12px] text-[#6B7280] file:mr-3 file:h-9 file:px-3 file:border-0 file:rounded-md file:bg-[#F3F4F6] file:text-[#111827] file:text-[12px] file:font-medium file:cursor-pointer"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-semibold text-[#6B7280] mb-1">Código carrera</label>
          <input
            type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)}
            placeholder="ICQ" maxLength={5} className={`${inputCls} w-24 uppercase`} required
          />
        </div>
        <div className="flex flex-col flex-1 min-w-[180px]">
          <label className="text-[11px] font-semibold text-[#6B7280] mb-1">Nombre (opcional)</label>
          <input
            type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Química" className={inputCls}
          />
        </div>
        <button
          type="submit" disabled={busy}
          className="h-9 px-4 inline-flex items-center gap-1.5 bg-[#111827] text-white text-[13px] font-medium rounded-md hover:bg-[#1f2937] transition-colors disabled:opacity-50"
        >
          <Upload size={14} /> {busy ? "Subiendo…" : "Subir planilla"}
        </button>
      </form>

      {status && (
        <div className={`flex items-center gap-1.5 text-[12px] mt-3 ${status.ok ? "text-[#059669]" : "text-[#DC2626]"}`}>
          {status.ok ? <Check size={13} /> : <AlertCircle size={13} />} {status.msg}
        </div>
      )}
    </section>
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
