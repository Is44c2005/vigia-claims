const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

// ─── Types ───────────────────────────────────────────────────

export interface Siniestro {
  id_siniestro:              string;
  score_motor?:              number;
  semaforo_motor?:           "Rojo" | "Amarillo" | "Verde";
  ramo?:                     string;
  cobertura?:                string;
  monto_reclamado?:          number;
  suma_asegurada?:           number;
  reglas_criticas_activadas?:string;
  num_señales_motor?:        number;
  señales_motor?:            string;
  prob_fraude_ml?:           number;
  nivel_riesgo_ml?:          string;
  id_proveedor?:             string;
  id_asegurado?:             string;
  estado?:                   string;
  sucursal?:                 string;
  explicacion_alerta?:       string;
  descripcion?:              string;
  [key: string]:             unknown;
}

export interface Estadisticas {
  total_siniestros:   number;
  rojos:              number;
  amarillos:          number;
  verdes:             number;
  monto_riesgo_total: number;
  score_promedio:     number;
  fraude_confirmado?: number;
  alto_riesgo_ml?:    number;
}

export interface Proveedor {
  id_proveedor:                 string;
  nombre_proveedor?:            string;
  alertas_rojas:                number;
  en_lista_restrictiva?:        boolean;
  porcentaje_casos_observados?: number;
}

export interface FiltrosDisponibles {
  ramos:      string[];
  sucursales: string[];
  coberturas: string[];
}

export interface Filtros {
  semaforo:  string[];   // ["Rojo", "Amarillo", "Verde"]
  ramo:      string;
  sucursal:  string;
  cobertura: string;
  scoreMin:  number;
  scoreMax:  number;
}

export const DEFAULT_FILTROS: Filtros = {
  semaforo:  ["Rojo", "Amarillo", "Verde"],
  ramo:      "Todos",
  sucursal:  "Todas",
  cobertura: "Todas",
  scoreMin:  0,
  scoreMax:  100,
};

export interface SiniestrosResp {
  total: number;
  data:  Siniestro[];
}

export interface NuevoSiniestroPayload {
  id_siniestro:                  string;
  ramo:                          string;
  cobertura:                     string;
  monto_reclamado:               number;
  suma_asegurada:                number;
  dias_desde_inicio_poliza:      number;
  dias_entre_ocurrencia_reporte: number;
  historial_siniestros_asegurado:number;
  siniestros_vehiculo_18m:       number;
  proveedor_lista_restrictiva:   string;
  documentos_completos:          string;
  documentos_inconsistentes:     string;
  descripcion:                   string;
}

// ─── Fetch helper ─────────────────────────────────────────────

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error desconocido" }));
    throw new Error((err as { detail: string }).detail ?? "Error en la API");
  }
  return res.json() as Promise<T>;
}

// ─── API client ───────────────────────────────────────────────

export const api = {
  health: () => req<{ status: string }>("/health"),

  estadisticas: () => req<Estadisticas>("/estadisticas"),

  siniestros: (f: Filtros, limit = 500) => {
    const p = new URLSearchParams();
    if (f.semaforo.length < 3) p.set("semaforo", f.semaforo.join(","));
    if (f.ramo      !== "Todos")  p.set("ramo",      f.ramo);
    if (f.sucursal  !== "Todas")  p.set("sucursal",  f.sucursal);
    if (f.cobertura !== "Todas")  p.set("cobertura", f.cobertura);
    p.set("score_min", String(f.scoreMin));
    p.set("score_max", String(f.scoreMax));
    p.set("limit", String(limit));
    return req<SiniestrosResp>(`/siniestros?${p}`);
  },

  siniestro: (id: string) => req<Siniestro>(`/siniestros/${encodeURIComponent(id)}`),

  filtros: () => req<FiltrosDisponibles>("/filtros"),

  proveedores: () => req<Proveedor[]>("/proveedores"),

  graficoSemaforo: (f: Filtros) => {
    const p = new URLSearchParams();
    if (f.semaforo.length < 3) p.set("semaforo", f.semaforo.join(","));
    if (f.ramo !== "Todos")    p.set("ramo", f.ramo);
    return req<{ name: string; value: number }[]>(`/graficos/semaforo?${p}`);
  },

  graficoScore: () =>
    req<{ semaforo: string; scores: number[] }[]>("/graficos/score"),

  graficoRamo: () =>
    req<{ ramo: string; semaforo_motor: string; cnt: number }[]>("/graficos/ramo"),

  graficoML: () => req<Siniestro[]>("/graficos/ml"),

  analizar: (data: NuevoSiniestroPayload) =>
    req<Record<string, unknown>>("/analizar", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    }),

  chat: (sessionId: string, message: string) =>
    req<{ response: string; session_id: string }>("/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ session_id: sessionId, message }),
    }),

  resetChat: (sessionId: string) =>
    req<{ ok: boolean }>(`/chat/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    }),
};
