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
  total_siniestros:      number;
  rojos:                 number;
  amarillos:             number;
  verdes:                number;
  monto_riesgo_total:    number;
  monto_riesgo_amarillo?: number;
  score_promedio:        number;
  fraude_confirmado?:    number;
  alto_riesgo_ml?:       number;
}

export interface GrafoNode {
  id:                    string;
  type:                  "siniestro" | "asegurado" | "proveedor" | "vehiculo";
  label:                 string;
  semaforo?:             string | null;
  score?:                number;
  en_lista_restrictiva?: boolean;
}

export interface GrafoEdge {
  source: string;
  target: string;
  label:  string;
}

export interface GrafoData {
  nodes:         GrafoNode[];
  edges:         GrafoEdge[];
  insights:      Record<string, string>;
  total_nodos:   number;
  total_aristas: number;
}

// ─── Relaciones analíticas ─────────────────────────────────────

export interface ProveedorRanking {
  id_proveedor:      string;
  nombre?:           string;
  tipo?:             string;
  casos_rojo:        number;
  casos_amarillo:    number;
  total_casos:       number;
  pct_concentracion: number;
  en_lista?:         string;
}

export interface AseguradoRanking {
  id_asegurado:          string;
  siniestros_criticos:   number;
  score_maximo?:         number;
  semaforo_predominante?:string;
  proveedores_distintos?:number;
}

export interface RankingProvResp {
  insight: {
    top3_pct:        number;
    top3_count:      number;
    total_rojos:     number;
    asegurado_top:   string;
    asegurado_top_n: number;
  };
  metricas: {
    proveedores_en_alerta:  number;
    asegurados_recurrentes: number;
    clusteres_detectados:   number;
  };
  tabla_proveedores: ProveedorRanking[];
  tabla_asegurados:  AseguradoRanking[];
}

export interface SelectorPrv {
  id_proveedor: string;
  nombre?:      string;
  casos_rojo:   number;
}

export interface DetalleProvResp {
  proveedor: {
    id:                   string;
    nombre:               string;
    en_lista_restrictiva: boolean;
    tipo:                 string;
  };
  distribucion: { rojo: number; amarillo: number; verde: number; total: number; };
  metricas: {
    monto_total:             number;
    promedio_por_caso:       number;
    asegurados_distintos:    number;
    pct_docs_inconsistentes: number;
  };
  senales_frecuentes: Array<{
    codigo:      string;
    texto:       string;
    frecuencia:  number;
    total_casos: number;
    es_critica:  boolean;
  }>;
  reglas_criticas: Array<{
    codigo:      string;
    frecuencia:  number;
    total_casos: number;
  }>;
  siniestros: Array<{
    id_siniestro:   string;
    id_asegurado?:  string;
    cobertura?:     string;
    monto_reclamado?:number;
    score_motor?:   number;
    semaforo_motor?:string;
  }>;
}

export interface GrafoClusterResp {
  nodes:            GrafoNode[];
  edges:            GrafoEdge[];
  total_nodos:      number;
  total_aristas:    number;
  nombre_proveedor: string;
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

  grafo: (
    semaforo     = "Rojo,Amarillo",
    soloLista    = false,
    minConexiones = 1,
    idProveedor  = "",
    limite       = 300,
  ) => {
    const p = new URLSearchParams({ semaforo, limite: String(limite) });
    if (soloLista)         p.set("solo_lista_restrictiva", "true");
    if (minConexiones > 1) p.set("min_conexiones", String(minConexiones));
    if (idProveedor)       p.set("id_proveedor", idProveedor);
    return req<GrafoData>(`/grafo?${p}`);
  },

  relacionesRanking:  () => req<RankingProvResp>("/relaciones/ranking-proveedores"),
  relacionesSelector: () => req<SelectorPrv[]>("/relaciones/selector-proveedores"),
  relacionesDetalle:  (id: string) =>
    req<DetalleProvResp>(`/relaciones/detalle-proveedor?id=${encodeURIComponent(id)}`),
  relacionesGrafo:    (id: string) =>
    req<GrafoClusterResp>(`/relaciones/grafo-cluster?id=${encodeURIComponent(id)}`),

  reporteAuditoria: async () => {
    const res = await fetch(BASE + "/reporte/csv");
    if (!res.ok) throw new Error("Error al generar el reporte de auditoría");
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `reporte_auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
