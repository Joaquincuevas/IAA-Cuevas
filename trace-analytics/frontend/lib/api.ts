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

export async function getCobertura(carrera?: string) {
  const q = carrera ? `?carrera=${carrera}` : "";
  return apiFetch<{
    stats: { cobertura_global: number; dominios: number; dominios_debiles: number; ciclos: number };
    heatmap: { pe: string; semestre: string; nivel: number }[];
    domains: { code: string; name: string; description: string; cobertura: number }[];
    carreras: string[];
  }>(`/api/cobertura${q}`);
}

export async function getRedundancia() {
  return apiFetch<{
    clusters: {
      id: string; nombre: string; severidad: string; overlap: number;
      cursos: { id: string; nombre: string }[];
      total_objetivos: number; total_cursos: number;
    }[];
    stats: {
      clusters_detectados: number; horas_duplicadas: number;
      ras_huerfanos: number; ras_sobre_cubiertos: number;
    };
  }>("/api/redundancia");
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
