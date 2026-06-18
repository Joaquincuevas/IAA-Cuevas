"use client";

import { useEffect, useState, useRef } from "react";
import { User, Lock, MessageSquare, Filter, Check, AlertCircle, RefreshCw, Cpu, Trash2, X } from "lucide-react";
import {
  getMe,
  changePassword,
  getChatHistory,
  getFilterHistory,
  recomputeAI,
  getAICurrentJob,
  getAIJobStatus,
  cancelAIJob,
  clearAllAIResults,
  getAILatestJobs,
  getAIStats,
  type AIJob,
  type AIStats,
} from "@/lib/api";

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
    <div className="p-9 max-w-5xl">
      <div className="mb-7">
        <h1 className="text-[26px] font-bold text-[#111827] tracking-tight">Configuración</h1>
        <p className="text-[14px] text-[#6B7280] mt-1">Tu perfil, seguridad de la cuenta y actividad reciente.</p>
      </div>

      {/* Análisis IA — full width */}
      <AIAnalysisSection />

      <div className="grid grid-cols-2 gap-5 mt-5">
        {/* Perfil */}
        <section className="border border-[#E5E7EB] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <User size={15} className="text-[#1B2A4A]" />
            <h2 className="text-[16px] font-bold text-[#111827]">Perfil</h2>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-[#1B2A4A] text-white flex items-center justify-center text-[16px] font-bold">
              {me?.name?.[0] ?? "?"}
            </div>
            <div>
              <p className="text-[15px] font-bold text-[#111827]">{me?.name ?? "…"}</p>
              <p className="text-[12px] text-[#6B7280]">{me?.email ?? ""}</p>
            </div>
          </div>
          <dl className="text-[12px] space-y-2">
            <Row k="Último ingreso" v={fmtDate(me?.last_login ?? null)} />
            <Row k="Conversaciones guardadas" v={String(me?.actividad?.chats ?? 0)} />
            <Row k="Filtros guardados" v={String(me?.actividad?.filtros ?? 0)} />
          </dl>
        </section>

        {/* Cambiar contraseña */}
        <section className="border border-[#E5E7EB] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={15} className="text-[#1B2A4A]" />
            <h2 className="text-[16px] font-bold text-[#111827]">Cambiar contraseña</h2>
          </div>
          <ChangePasswordForm />
        </section>

        {/* Últimas conversaciones */}
        <section className="border border-[#E5E7EB] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={15} className="text-[#1B2A4A]" />
            <h2 className="text-[16px] font-bold text-[#111827]">Últimas conversaciones con Taula</h2>
          </div>
          {chats.length === 0 ? (
            <p className="text-[12px] text-[#9CA3AF]">Aún no has conversado con la IA.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {chats.slice(-8).reverse().map((m, i) => (
                <div key={i} className="text-[12px]">
                  <span className={`font-semibold ${m.role === "user" ? "text-[#1B2A4A]" : "text-[#6B7280]"}`}>
                    {m.role === "user" ? "Tú" : "Taula"}:
                  </span>{" "}
                  <span className="text-[#374151]">{m.content.slice(0, 120)}{m.content.length > 120 ? "…" : ""}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Filtros guardados */}
        <section className="border border-[#E5E7EB] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={15} className="text-[#1B2A4A]" />
            <h2 className="text-[16px] font-bold text-[#111827]">Filtros guardados</h2>
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

// ── AI Analysis Section ───────────────────────────────────────────────────────

const CARRERAS_OPTIONS = [
  { code: "", label: "Todas las carreras" },
  { code: "ICC", label: "ICC — Computación" },
  { code: "ICI", label: "ICI — Industrial" },
  { code: "IOC", label: "IOC — Obras Civiles" },
  { code: "ICE", label: "ICE — Eléctrica" },
  { code: "ICA", label: "ICA — Ambiental" },
];

function fmtJobDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
    return d.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
  } catch { return iso; }
}

/** Timestamp del inicio real del job en el servidor (no cuando se abrió la página). */
function parseJobStartedAt(iso: string | null | undefined): number | null {
  if (!iso) return null;
  try {
    const t = new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;
  }
}

function jobElapsedSeconds(job: AIJob, now = Date.now()): number | null {
  const start = parseJobStartedAt(job.started_at);
  if (start == null) return null;
  const end =
    job.status === "running" || job.status === "pending"
      ? now
      : parseJobStartedAt(job.finished_at) ?? now;
  return Math.max(0, Math.floor((end - start) / 1000));
}

function AIAnalysisSection() {
  const [jobType,  setJobType]  = useState<"conexiones" | "redundancia" | "all">("conexiones");
  const [carrera,  setCarrera]  = useState("");
  const [phase,    setPhase]    = useState<"idle" | "starting" | "running" | "done" | "error" | "cancelled">("idle");
  const [job,      setJob]      = useState<AIJob | null>(null);
  const [latest,   setLatest]   = useState<{ conexiones: AIJob | null; redundancia: AIJob | null; running: AIJob[] } | null>(null);
  const [stats,    setStats]    = useState<AIStats | null>(null);
  const [msg,      setMsg]      = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed,  setElapsed]  = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobIdRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  };

  const syncElapsedFromJob = (j: AIJob) => {
    const start = parseJobStartedAt(j.started_at);
    if (start == null) return;
    setStartedAt(start);
    const sec = jobElapsedSeconds(j);
    if (sec != null) setElapsed(sec);
  };

  const pollJob = async (): Promise<boolean> => {
    try {
      let j: AIJob;
      try {
        j = await getAICurrentJob();
      } catch {
        if (!activeJobIdRef.current) return false;
        j = await getAIJobStatus(activeJobIdRef.current);
      }
      setJob(j);
      activeJobIdRef.current = j.id;
      if (j.status === "running" || j.status === "pending") {
        setPhase("running");
        syncElapsedFromJob(j);
      }
      if (j.status === "done") {
        setPhase("done");
        syncElapsedFromJob(j);
        setMsg("Análisis completado. Revisa Conexiones IA o Redundancia.");
        getAILatestJobs().then(setLatest).catch(() => {});
        getAIStats().then(setStats).catch(() => {});
        return true;
      }
      if (j.status === "error") {
        setPhase("error");
        syncElapsedFromJob(j);
        setMsg(j.error_msg || "El análisis falló sin mensaje de error.");
        return true;
      }
      if (j.status === "cancelled") {
        setPhase("cancelled");
        syncElapsedFromJob(j);
        setMsg(j.error_msg || "Análisis cancelado.");
        getAIStats().then(setStats).catch(() => {});
        return true;
      }
      return false;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error consultando el estado del análisis");
      return false;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollJob();
    pollRef.current = setInterval(async () => {
      const finished = await pollJob();
      if (finished) stopPolling();
    }, 2000);
  };

  useEffect(() => {
    getAILatestJobs()
      .then((r) => {
        setLatest(r);
        if (r.running?.length > 0) {
          const active = r.running[0];
          activeJobIdRef.current = active.id;
          setJob(active);
          setPhase("running");
          syncElapsedFromJob(active);
          setMsg("Análisis en curso — retomando seguimiento…");
          startPolling();
        }
      })
      .catch(() => {});
    getAIStats().then(setStats).catch(() => {});
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "running" || startedAt == null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    elapsedRef.current = setInterval(tick, 1000);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [phase, startedAt]);

  async function handleRecompute() {
    setMsg("");
    setJob(null);
    setPhase("starting");
    setStartedAt(null);
    setElapsed(0);
    activeJobIdRef.current = null;
    try {
      const r = await recomputeAI(jobType, carrera || undefined);
      activeJobIdRef.current = r.job_id;
      setPhase("running");
      if (r.already_running) {
        setMsg("Ya había un análisis en curso — mostrando progreso.");
      } else {
        setMsg("Análisis iniciado. Cada curso tarda ~2–5 s (Groq).");
      }
      startPolling();
    } catch (e) {
      setPhase("error");
      setMsg(e instanceof Error ? e.message : "Error al iniciar el análisis.");
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const r = await cancelAIJob();
      setJob(r.job);
      activeJobIdRef.current = r.job.id;
      setPhase("cancelled");
      syncElapsedFromJob(r.job);
      setMsg("Análisis cancelado.");
      stopPolling();
      getAIStats().then(setStats).catch(() => {});
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo cancelar el análisis.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleClearAll() {
    setClearing(true);
    try {
      const r = await clearAllAIResults();
      stopPolling();
      setPhase("idle");
      setJob(null);
      setStartedAt(null);
      setElapsed(0);
      activeJobIdRef.current = null;
      setLatest({ conexiones: null, redundancia: null, running: [] });
      setStats({ ra_pe: { total: 0, pending: 0, approved: 0, rejected: 0 }, redundancia: { total: 0, pending: 0 } });
      setMsg(
        `Eliminados: ${r.deleted.conexiones} conexiones, ${r.deleted.redundancia} redundancias, ${r.deleted.votes} votos.`
      );
      setShowClearConfirm(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudieron eliminar los resultados.");
    } finally {
      setClearing(false);
    }
  }

  const statusColor: Record<string, string> = {
    pending: "#F59E0B", running: "#3B82F6", done: "#10B981", error: "#EF4444", cancelled: "#F59E0B",
  };

  const progress = job?.progress;
  const pct = progress?.pct ?? (phase === "starting" ? 0 : phase === "running" ? 5 : 100);
  const isBusy = phase === "starting" || phase === "running";

  function fmtElapsed(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  return (
    <section className="border border-[#E5E7EB] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Cpu size={15} className="text-[#1B2A4A]" />
        <h2 className="text-[14px] font-bold text-[#111827]">Análisis IA</h2>
        <span className="text-[10px] font-semibold bg-[#EFF6FF] text-[#3B82F6] border border-[#BFDBFE] rounded-full px-2 py-0.5">
          Groq batch
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatMini label="Conexiones RA→PE" val={stats?.ra_pe.total ?? 0} sub={`${stats?.ra_pe.approved ?? 0} aprobadas`} />
        <StatMini label="Pendientes revisión" val={stats?.ra_pe.pending ?? 0} sub="conexiones" />
        <StatMini label="Pares redundantes" val={stats?.redundancia.total ?? 0} sub={`${(stats?.redundancia.total ?? 0) - (stats?.redundancia.pending ?? 0)} revisados`} />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="text-[11px] font-semibold text-[#6B7280] block mb-1">Tipo de análisis</label>
          <select
            value={jobType}
            disabled={isBusy}
            onChange={(e) => setJobType(e.target.value as typeof jobType)}
            className="text-[12px] border border-[#E5E7EB] rounded-md px-2 py-1.5 text-[#374151] disabled:opacity-50"
          >
            <option value="conexiones">Solo Conexiones RA→PE</option>
            <option value="redundancia">Solo Redundancia</option>
            <option value="all">Ambos (Conexiones + Redundancia)</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[#6B7280] block mb-1">Carrera</label>
          <select
            value={carrera}
            disabled={isBusy}
            onChange={(e) => setCarrera(e.target.value)}
            className="text-[12px] border border-[#E5E7EB] rounded-md px-2 py-1.5 text-[#374151] disabled:opacity-50"
          >
            {CARRERAS_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button
            disabled={isBusy}
            onClick={handleRecompute}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#1B2A4A] text-white text-[12px] font-medium rounded-md hover:bg-[#243B6E] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isBusy ? "animate-spin" : ""} />
            {phase === "starting" ? "Iniciando…" : isBusy ? "Procesando…" : "Recalcular"}
          </button>
          {isBusy && (
            <button
              disabled={cancelling || phase === "starting"}
              onClick={handleCancel}
              className="px-4 py-1.5 border border-[#FECACA] text-[#DC2626] text-[12px] font-medium rounded-md hover:bg-[#FEF2F2] transition-colors disabled:opacity-50"
            >
              {cancelling ? "Cancelando…" : "Cancelar"}
            </button>
          )}
        </div>
      </div>

      {/* Panel de progreso */}
      {(isBusy || phase === "done" || phase === "error" || phase === "cancelled") && (
        <div className={`border rounded-lg p-4 mb-3 text-[12px] ${
          phase === "error" ? "border-[#FECACA] bg-[#FEF2F2]" :
          phase === "done" ? "border-[#BBF7D0] bg-[#F0FDF4]" :
          phase === "cancelled" ? "border-[#FDE68A] bg-[#FFFBEB]" :
          "border-[#BFDBFE] bg-[#EFF6FF]"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {job && (
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ color: statusColor[job.status] ?? "#6B7280", background: (statusColor[job.status] ?? "#6B7280") + "18" }}
                >
                  {job.status === "running" ? "En progreso" :
                   job.status === "done" ? "Completado" :
                   job.status === "error" ? "Error" :
                   job.status === "cancelled" ? "Cancelado" : job.status}
                </span>
              )}
              {!job && phase === "starting" && (
                <span className="text-[11px] text-[#6B7280]">Iniciando…</span>
              )}
            </div>
            {(startedAt && elapsed > 0) && (
              <span className="text-[11px] text-[#6B7280]">Tiempo: {fmtElapsed(elapsed)}</span>
            )}
          </div>

          {isBusy && (
            <>
              <div className="w-full h-2.5 bg-[#E5E7EB] rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-[#3B82F6] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(pct, 2))}%` }}
                />
              </div>
              <p className="text-[#374151] font-medium mb-1">
                {progress?.message || (phase === "starting" ? "Conectando con el servidor…" : "Procesando…")}
              </p>
              {progress && progress.total_steps > 0 && (
                <p className="text-[11px] text-[#6B7280]">
                  {progress.phase === "conexiones" ? "Fase: Conexiones RA→PE" : progress.phase === "redundancia" ? "Fase: Redundancia" : `Fase: ${progress.phase}`}
                  {" · "}{progress.step}/{progress.total_steps} ({pct}%)
                  {progress.propuestas !== undefined && ` · ${progress.propuestas} propuestas`}
                  {progress.errores !== undefined && progress.errores > 0 && ` · ${progress.errores} errores`}
                </p>
              )}
              <p className="text-[11px] text-[#9CA3AF] mt-2">
                Puedes dejar esta página abierta. El análisis continúa en segundo plano (~2–5 s por curso).
              </p>
            </>
          )}

          {phase === "done" && job?.stats && (
            <div className="text-[#166534]">
              <p className="font-medium mb-1">Análisis finalizado correctamente.</p>
              <ul className="text-[11px] space-y-0.5 list-disc pl-4">
                {"conexiones" in (job.stats as object) && (
                  <li>Conexiones: {(job.stats as { conexiones?: { propuestas?: number } }).conexiones?.propuestas ?? 0} propuestas generadas</li>
                )}
                {"redundancia" in (job.stats as object) && (
                  <li>Redundancia: {(job.stats as { redundancia?: { propuestas?: number } }).redundancia?.propuestas ?? 0} pares detectados</li>
                )}
              </ul>
            </div>
          )}

          {phase === "error" && (
            <p className="text-[#DC2626]">{msg || job?.error_msg}</p>
          )}

          {phase === "cancelled" && (
            <p className="text-[#92400E]">{msg || job?.error_msg || "Análisis cancelado."}</p>
          )}
        </div>
      )}

      {msg && phase === "idle" && (
        <p className="text-[12px] text-[#6B7280] mb-3">{msg}</p>
      )}

      <div className="text-[11px] text-[#9CA3AF] space-y-0.5">
        {latest?.conexiones && (
          <p>Último análisis de conexiones: {fmtJobDate(latest.conexiones.finished_at)}</p>
        )}
        {latest?.redundancia && (
          <p>Último análisis de redundancia: {fmtJobDate(latest.redundancia.finished_at)}</p>
        )}
        {phase === "idle" && !latest?.conexiones && !latest?.redundancia && (
          <p>Aún no se ha ejecutado ningún análisis IA. Haz clic en Recalcular para iniciar.</p>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-[#E5E7EB]">
        <p className="text-[11px] text-[#6B7280] mb-2">
          Borra solo los resultados generados por IA (conexiones, redundancias y votos). Los Excel con RAs, PEs y matrices no se modifican.
        </p>
        <button
          type="button"
          disabled={isBusy || clearing || (stats?.ra_pe.total === 0 && stats?.redundancia.total === 0)}
          onClick={() => setShowClearConfirm(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 border border-[#FECACA] text-[#DC2626] text-[12px] font-medium rounded-md hover:bg-[#FEF2F2] transition-colors disabled:opacity-50"
        >
          <Trash2 size={13} />
          Eliminar todos los resultados IA
        </button>
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[440px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Eliminar resultados IA</h3>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="text-[#9CA3AF] hover:text-[#374151]"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-[13px] text-[#374151] mb-2">
              Se eliminarán permanentemente:
            </p>
            <ul className="text-[12px] text-[#6B7280] list-disc pl-5 mb-4 space-y-1">
              <li>{stats?.ra_pe.total ?? 0} propuestas de conexiones RA→PE</li>
              <li>{stats?.redundancia.total ?? 0} pares de redundancia</li>
              <li>Todos los votos y el historial de jobs IA</li>
            </ul>
            <p className="text-[12px] text-[#9CA3AF] mb-5">
              No se borran los objetivos, PEs ni matrices del currículo (Excel).
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-[12px] border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F9FAFB]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={handleClearAll}
                className="px-4 py-2 text-[12px] rounded-lg text-white font-medium bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {clearing ? "Eliminando…" : "Sí, eliminar todo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function StatMini({ label, val, sub }: { label: string; val: number; sub: string }) {
  return (
    <div className="bg-[#F9FAFB] rounded-lg p-3">
      <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-1">{label}</p>
      <p className="text-[22px] font-bold text-[#111827] leading-tight">{val}</p>
      <p className="text-[11px] text-[#9CA3AF]">{sub}</p>
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
