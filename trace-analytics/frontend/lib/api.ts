const BASE = "http://localhost:8000";

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
