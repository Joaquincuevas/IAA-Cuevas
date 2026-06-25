const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("trace_token") ?? "";
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Error desconocido");
  }
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  return apiFetch<{ token: string; user: { email: string; name: string; role: string } }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) }
  );
}

export async function getStats() {
  return apiFetch<{ cursos: number; objetivos: number; links: number; carreras: number }>("/api/stats");
}

export async function getMe() {
  return apiFetch<{
    email: string; name: string; role: string; last_login: string | null;
    actividad: { chats: number; filtros: number };
  }>("/api/me");
}

export async function changePassword(oldPassword: string, newPassword: string) {
  return apiFetch<{ message: string }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}

export async function getChatHistory() {
  return apiFetch<{ messages: { role: string; content: string; created_at: string }[] }>(
    "/api/history/chat"
  );
}

export async function saveFilterSnapshot(label: string, filters: Record<string, unknown>) {
  return apiFetch<{ message: string }>("/api/history/filters", {
    method: "POST",
    body: JSON.stringify({ label, filters }),
  });
}

export async function getFilterHistory() {
  return apiFetch<{ snapshots: { label: string; filters: Record<string, unknown>; created_at: string }[] }>(
    "/api/history/filters"
  );
}

export async function getConexiones(carrera?: string) {
  const q = carrera ? `?carrera=${carrera}` : "";
  return apiFetch<{
    cursos: {
      id: string; nombre: string; carrera: string; carrera_nombre: string;
      recibe_de: number; alimenta_a: number; total_conexiones: number;
    }[];
    stats: {
      cursos_analizados: number; conexiones_totales: number;
      cursos_hub: number; cursos_huerfanos: number; promedio_por_curso: number;
    };
  }>(`/api/conexiones${q}`);
}

export async function getObjectives() {
  return apiFetch<{ objectives: { curso: string; id_objetivo: string; descripcion: string }[] }>(
    "/api/objectives"
  );
}

export async function getCobertura(carrera?: string) {
  const q = carrera ? `?carrera=${carrera}` : "";
  return apiFetch<{
    stats: { cobertura_global: number; dominios: number; dominios_debiles: number; ciclos: number };
    heatmap: { pe: string; semestre: string; nivel: number }[];
    domains: { code: string; name: string; description: string; cobertura: number }[];
    carreras: string[];
  }>(`/api/cobertura${q}`);
}

// ── AI módulo: Conexiones RA→PE y Redundancia semántica ──────────────────────

export type AIRaPeProposal = {
  id: number;
  job_id: number;
  carrera: string;
  ra_id: string;
  ra_texto: string;
  curso_id: string;
  curso_nombre: string;
  pe_id: string;
  pe_texto: string;
  confianza: number;
  razon: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type AIRedundancyProposal = {
  id: number;
  job_id: number;
  carrera: string;
  ra_id_a: string;
  ra_texto_a: string;
  curso_a: string;
  ra_id_b: string;
  ra_texto_b: string;
  curso_b: string;
  similitud: number;
  razon: string;
  tipo: "semantica" | "curricular";
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type AIJobProgress = {
  phase: string;
  step: number;
  total_steps: number;
  pct: number;
  message: string;
  propuestas?: number;
  errores?: number;
  curso?: string;
  updated_at?: string;
};

export type AIJob = {
  id: number;
  job_type: string;
  carrera: string | null;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  excel_hash: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_msg: string | null;
  stats: Record<string, unknown>;
  progress: AIJobProgress;
};

export type AIStats = {
  ra_pe: { total: number; pending: number; approved: number; rejected: number };
  redundancia: { total: number; pending: number };
};

export async function getAIConexiones(params?: {
  carrera?: string;
  status?: string;
  curso?: string;
  pe?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.carrera) q.set("carrera", params.carrera);
  if (params?.status) q.set("status", params.status);
  if (params?.curso) q.set("curso", params.curso);
  if (params?.pe) q.set("pe", params.pe);
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<{ proposals: AIRaPeProposal[]; total: number; limit: number; offset: number }>(
    `/api/ai/conexiones${qs ? "?" + qs : ""}`
  );
}

export async function getAIRedundancia(params?: {
  carrera?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.carrera) q.set("carrera", params.carrera);
  if (params?.status) q.set("status", params.status);
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<{ proposals: AIRedundancyProposal[]; total: number }>(
    `/api/ai/redundancia${qs ? "?" + qs : ""}`
  );
}

export async function castAIVote(
  targetType: "ra_pe" | "redundancy",
  targetId: number,
  voto: "approve" | "reject",
  comentario?: string
) {
  return apiFetch<{ proposal: AIRaPeProposal | AIRedundancyProposal }>("/api/ai/votes", {
    method: "POST",
    body: JSON.stringify({ target_type: targetType, target_id: targetId, voto, comentario }),
  });
}

export async function recomputeAI(jobType: "conexiones" | "redundancia" | "all", carrera?: string) {
  return apiFetch<{ job_id: number; status: string; message: string; already_running?: boolean }>(
    "/api/ai/recompute",
    { method: "POST", body: JSON.stringify({ job_type: jobType, carrera }) }
  );
}

export async function getAIJobStatus(jobId: number) {
  return apiFetch<AIJob>(`/api/ai/jobs/${jobId}`);
}

export async function getAICurrentJob() {
  return apiFetch<AIJob>("/api/ai/jobs/current");
}

export async function cancelAIJob() {
  return apiFetch<{ message: string; job: AIJob }>("/api/ai/cancel", { method: "POST" });
}

export async function clearAllAIResults() {
  return apiFetch<{
    message: string;
    deleted: { votes: number; conexiones: number; redundancia: number; jobs: number };
  }>("/api/ai/clear-all", { method: "POST" });
}

export async function getAILatestJobs() {
  return apiFetch<{ conexiones: AIJob | null; redundancia: AIJob | null; running: AIJob[] }>(
    "/api/ai/jobs/latest"
  );
}

export async function getAIStats(carrera?: string) {
  const q = carrera ? `?carrera=${carrera}` : "";
  return apiFetch<AIStats>(`/api/ai/stats${q}`);
}

export async function exportAIConexiones(carrera?: string) {
  const q = carrera ? `?carrera=${carrera}` : "";
  return apiFetch<{ conexiones: AIRaPeProposal[]; total: number }>(`/api/ai/export/conexiones${q}`);
}

export async function taulaChat(message: string, history: { role: string; content: string }[]) {
  return apiFetch<{ reply: string }>("/api/taula/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
}

export type HeatmapData = {
  competencias: { id: number; texto_corto: string; texto_completo: string }[];
  semestres: number[];
  matriz: number[][];
  cobertura_global_pct: number;
  competencias_debiles: { id: number; texto_corto: string; pct: number }[];
  total_cursos: number;
};

export async function getCoberturaHeatmap(carrera: string) {
  return apiFetch<HeatmapData>(`/api/cobertura/heatmap?carrera=${carrera}`);
}

export async function getCoberturaComparacion() {
  return apiFetch<Record<string, number>>("/api/cobertura/comparacion");
}

export async function getCoberturaCursos(carrera: string, competenciaId: number) {
  return apiFetch<{
    cursos: { codigo_curso: string; nombre_curso: string; semestre: number }[];
  }>(`/api/cobertura/cursos?carrera=${carrera}&competencia_id=${competenciaId}`);
}

export type TributacionCompetencia = {
  competencia_id: number;
  texto_corto: string;
  texto_completo: string;
  cursos: { codigo_curso: string; nombre_curso: string; semestre: number }[];
};

export async function getCoberturaTributaciones(carrera: string) {
  return apiFetch<{ competencias: TributacionCompetencia[] }>(
    `/api/cobertura/tributaciones?carrera=${carrera}`
  );
}

