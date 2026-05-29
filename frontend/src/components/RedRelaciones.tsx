import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ForceGraph2D from "react-force-graph-2d";
import {
  api, GrafoNode, GrafoEdge,
  RankingProvResp, ProveedorRanking, AseguradoRanking,
  DetalleProvResp, SelectorPrv, GrafoClusterResp,
} from "../lib/api";
import { COLORS, fmt, fmtMoney } from "../lib/utils";

interface Props {
  onNavigateToDetalle?: (id: string) => void;
}

type InnerTab = "ranking" | "detalle" | "grafo";

const INNER_TABS: { id: InnerTab; label: string }[] = [
  { id: "ranking", label: "Ranking de Riesgo" },
  { id: "detalle", label: "Detalle Proveedor" },
  { id: "grafo",   label: "Grafo de Clúster" },
];

// ─── Helpers visuales ─────────────────────────────────────────

function SemBadge({ sem }: { sem: string }) {
  const cls =
    sem === "Rojo"     ? "bg-red-900/50 text-red-300" :
    sem === "Amarillo" ? "bg-orange-900/50 text-orange-300" :
                         "bg-green-900/50 text-green-300";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{sem}</span>;
}

function ScoreBadge({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-[#666]">—</span>;
  const cls = score >= 76 ? "text-rojo" : score >= 41 ? "text-amarillo" : "text-verde";
  return <span className={`font-bold ${cls}`}>{score}</span>;
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 bg-surface2 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function MetCard({ title, value, sub, color }: { title: string; value: string; sub: string; color: string }) {
  const border = color === "rojo" ? "border-rojo" : color === "amarillo" ? "border-amarillo" : "border-blue-500";
  const valCls = color === "rojo" ? "text-rojo"   : color === "amarillo" ? "text-amarillo"   : "text-blue-400";
  return (
    <div className={`bg-surface rounded-xl border-l-4 ${border} p-4`}>
      <p className="text-accent text-xs uppercase tracking-wider mb-1">{title}</p>
      <p className={`text-2xl font-extrabold ${valCls}`}>{value}</p>
      <p className="text-[#555] text-xs mt-1">{sub}</p>
    </div>
  );
}

// ─── Tab 1: Ranking de Riesgo ──────────────────────────────────

function TabRanking({ onSelectProveedor }: { onSelectProveedor: (id: string) => void }) {
  const { data, isLoading, isError } = useQuery<RankingProvResp>({
    queryKey: ["relaciones-ranking"],
    queryFn:  api.relacionesRanking,
  });

  if (isLoading) return <p className="text-accent animate-pulse p-4">Calculando rankings…</p>;
  if (isError)   return <p className="text-rojo p-4">Error al cargar datos. ¿Está corriendo el backend?</p>;
  if (!data)     return null;

  const { insight, metricas, tabla_proveedores, tabla_asegurados } = data;

  return (
    <div className="space-y-6">
      {/* Insight automático */}
      <div className="bg-blue-900/25 border border-blue-700/40 rounded-xl p-4 text-sm text-blue-200">
        <span className="font-bold">Análisis automático — </span>
        Los 3 proveedores de mayor riesgo concentran el{" "}
        <span className="font-extrabold text-white">{insight.top3_pct}%</span> de los{" "}
        <span className="font-bold">{insight.total_rojos}</span> casos ROJO.
        El asegurado{" "}
        <span className="font-mono font-bold text-white">{insight.asegurado_top}</span>{" "}
        es titular de{" "}
        <span className="font-extrabold text-red-300">{insight.asegurado_top_n}</span> siniestros críticos.
      </div>

      {/* Tarjetas métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetCard
          title="Proveedores en Alerta"
          value={fmt(metricas.proveedores_en_alerta)}
          sub="con ≥3 siniestros Rojo"
          color="rojo"
        />
        <MetCard
          title="Asegurados Recurrentes"
          value={fmt(metricas.asegurados_recurrentes)}
          sub="con ≥2 siniestros Rojo"
          color="amarillo"
        />
        <MetCard
          title="Clústeres Detectados"
          value={fmt(metricas.clusteres_detectados)}
          sub="lista restrictiva o >50% rojos"
          color="blue"
        />
      </div>

      {/* Tabla proveedores */}
      <div className="bg-surface rounded-xl border border-surface2 p-5">
        <h3 className="text-text font-semibold mb-4">Proveedores con mayor concentración de alertas</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-accent text-xs uppercase tracking-wider">
              <tr>
                {["Proveedor", "Tipo", "Casos ROJO", "Casos AMARILLO", "Concentración", "Lista restrictiva"].map((h) => (
                  <th key={h} className="pb-3 pr-4 whitespace-nowrap font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla_proveedores.map((p: ProveedorRanking, i: number) => (
                <tr key={p.id_proveedor} className={`border-t border-surface2 ${i % 2 === 1 ? "bg-surface2/10" : ""}`}>
                  <td className="py-2.5 pr-4">
                    <button
                      onClick={() => onSelectProveedor(p.id_proveedor)}
                      className="text-accent hover:text-text text-xs font-mono hover:underline underline-offset-2 text-left"
                    >
                      {p.nombre ?? p.id_proveedor}
                    </button>
                  </td>
                  <td className="py-2.5 pr-4 text-[#888] text-xs">{p.tipo ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    <span className="bg-red-900/50 text-red-300 text-xs font-bold px-2 py-0.5 rounded">{p.casos_rojo}</span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="bg-orange-900/50 text-orange-300 text-xs font-bold px-2 py-0.5 rounded">{p.casos_amarillo}</span>
                  </td>
                  <td className="py-2.5 pr-4 min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <Bar pct={p.pct_concentracion} color={COLORS.Rojo} />
                      <span className="text-xs text-[#888] shrink-0 w-10 text-right">{p.pct_concentracion}%</span>
                    </div>
                  </td>
                  <td className="py-2.5">
                    {p.en_lista?.trim() === "Sí"
                      ? <span className="bg-red-900/50 text-red-300 text-xs font-bold px-2 py-0.5 rounded">Sí</span>
                      : <span className="bg-green-900/40 text-green-300 text-xs font-bold px-2 py-0.5 rounded">No</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla asegurados */}
      <div className="bg-surface rounded-xl border border-surface2 p-5">
        <h3 className="text-text font-semibold mb-4">Asegurados con mayor frecuencia de reclamos críticos</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-accent text-xs uppercase tracking-wider">
              <tr>
                {["Asegurado", "Siniestros críticos", "Proveedores distintos", "Score máx."].map((h) => (
                  <th key={h} className="pb-3 pr-4 whitespace-nowrap font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla_asegurados.map((a: AseguradoRanking, i: number) => (
                <tr key={a.id_asegurado} className={`border-t border-surface2 ${i % 2 === 1 ? "bg-surface2/10" : ""}`}>
                  <td className="py-2.5 pr-4 font-mono text-xs text-accent">{a.id_asegurado}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      {a.score_maximo != null && (
                        <SemBadge sem={a.score_maximo >= 76 ? "Rojo" : a.score_maximo >= 41 ? "Amarillo" : "Verde"} />
                      )}
                      <span className="font-bold text-text">{a.siniestros_criticos}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-text">{a.proveedores_distintos ?? "—"}</td>
                  <td className="py-2.5"><ScoreBadge score={a.score_maximo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 2: Detalle Proveedor ──────────────────────────────────

function TabDetalle({
  selectedPrv,
  selectorData,
  onSelectPrv,
  onNavigateToDetalle,
}: {
  selectedPrv:         string;
  selectorData:        SelectorPrv[];
  onSelectPrv:         (id: string) => void;
  onNavigateToDetalle?:(id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const { data, isLoading, isError } = useQuery<DetalleProvResp>({
    queryKey: ["relaciones-detalle", selectedPrv],
    queryFn:  () => api.relacionesDetalle(selectedPrv),
    enabled:  !!selectedPrv,
  });

  useEffect(() => { setPage(0); }, [selectedPrv]);

  const paginatedSiniestros = data?.siniestros.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];
  const totalPages          = Math.ceil((data?.siniestros.length ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Selector + badge de lista restrictiva */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-accent text-xs block mb-1">Proveedor</label>
          <select
            value={selectedPrv}
            onChange={(e) => onSelectPrv(e.target.value)}
            className="bg-surface2 text-text text-sm rounded px-3 py-1.5 border border-surface2 focus:outline-none min-w-[240px]"
          >
            {selectorData.map((p) => (
              <option key={p.id_proveedor} value={p.id_proveedor}>
                {p.nombre ?? p.id_proveedor} — {p.casos_rojo} rojos
              </option>
            ))}
          </select>
        </div>
        {data && (
          <div className="flex items-center gap-2 pb-0.5">
            {data.proveedor.en_lista_restrictiva ? (
              <span className="bg-red-900/50 text-red-300 text-xs font-bold px-3 py-1 rounded-full border border-red-700/40">
                ⚠ En lista restrictiva
              </span>
            ) : (
              <span className="bg-green-900/30 text-green-300 text-xs font-bold px-3 py-1 rounded-full border border-green-700/30">
                ✓ No en lista restrictiva
              </span>
            )}
            <span className="text-[#666] text-xs">
              Tipo: <span className="text-accent">{data.proveedor.tipo}</span>
            </span>
          </div>
        )}
      </div>

      {isLoading && <p className="text-accent animate-pulse text-sm">Cargando detalle…</p>}
      {isError   && <p className="text-rojo text-sm">Error al cargar proveedor.</p>}

      {data && (
        <>
          {/* Bloque 1: Distribución + Métricas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Distribución de casos */}
            <div className="bg-surface rounded-xl border border-surface2 p-5">
              <p className="text-accent text-xs uppercase tracking-wider mb-4 font-semibold">Distribución de casos</p>
              <div className="space-y-4">
                {(
                  [
                    { label: "Rojo",     n: data.distribucion.rojo,     color: COLORS.Rojo },
                    { label: "Amarillo", n: data.distribucion.amarillo, color: COLORS.Amarillo },
                    { label: "Verde",    n: data.distribucion.verde,    color: COLORS.Verde },
                  ] as const
                ).map(({ label, n, color }) => {
                  const pct = data.distribucion.total > 0
                    ? Math.round(n / data.distribucion.total * 100)
                    : 0;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text">{label}</span>
                        <span className="text-[#888]">{pct}% · {n} casos</span>
                      </div>
                      <Bar pct={pct} color={color} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Métricas clave */}
            <div className="bg-surface rounded-xl border border-surface2 p-5">
              <p className="text-accent text-xs uppercase tracking-wider mb-4 font-semibold">Métricas clave</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                {[
                  { k: "Monto total reclamado",   v: fmtMoney(data.metricas.monto_total) },
                  { k: "Promedio por caso",        v: fmtMoney(data.metricas.promedio_por_caso) },
                  { k: "Asegurados distintos",     v: fmt(data.metricas.asegurados_distintos) },
                  { k: "% docs inconsistentes",    v: `${data.metricas.pct_docs_inconsistentes}%` },
                ].map(({ k, v }) => (
                  <div key={k}>
                    <dt className="text-accent text-xs mb-0.5">{k}</dt>
                    <dd className="text-text font-semibold text-sm">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* Bloque 2: Señales más frecuentes */}
          <div className="bg-surface rounded-xl border border-surface2 p-5">
            <p className="text-accent text-xs uppercase tracking-wider mb-4 font-semibold">
              Señales más frecuentes en este proveedor
            </p>
            <div className="space-y-2">
              {/* Reglas RF primero */}
              {data.reglas_criticas.map((rf: DetalleProvResp["reglas_criticas"][number]) => (
                <div
                  key={rf.codigo}
                  className="flex items-center gap-3 bg-purple-900/25 border border-purple-700/30 rounded-lg px-3 py-2"
                >
                  <span className="text-base shrink-0">⚡</span>
                  <span className="text-purple-300 text-xs font-bold shrink-0">{rf.codigo}</span>
                  <span className="text-[#888] text-xs">
                    presente en {rf.frecuencia} de {rf.total_casos} casos
                  </span>
                </div>
              ))}

              {/* Señales S-XX */}
              {data.senales_frecuentes.map((s: DetalleProvResp["senales_frecuentes"][number]) => (
                <div
                  key={s.codigo}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
                    s.es_critica
                      ? "bg-red-950/50 border-red-700/30"
                      : "bg-orange-950/30 border-orange-700/20"
                  }`}
                >
                  <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${
                    s.es_critica ? "bg-red-800/60 text-red-200" : "bg-orange-800/40 text-orange-300"
                  }`}>
                    {s.codigo}
                  </span>
                  <span className="text-text text-xs flex-1">{s.texto}</span>
                  <span className="text-[#666] text-xs shrink-0">
                    {s.frecuencia}/{s.total_casos}
                  </span>
                </div>
              ))}

              {data.senales_frecuentes.length === 0 && data.reglas_criticas.length === 0 && (
                <p className="text-[#555] text-sm">Sin señales registradas para este proveedor.</p>
              )}
            </div>
          </div>

          {/* Bloque 3: Siniestros asociados */}
          <div className="bg-surface rounded-xl border border-surface2 p-5">
            <p className="text-accent text-xs uppercase tracking-wider mb-4 font-semibold">
              Siniestros asociados ({data.siniestros.length} total)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-accent text-xs uppercase tracking-wider">
                  <tr>
                    {["ID Siniestro", "Asegurado", "Cobertura", "Monto", "Score", "Semáforo"].map((h) => (
                      <th key={h} className="pb-3 pr-4 whitespace-nowrap font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedSiniestros.map((s: DetalleProvResp["siniestros"][number], i: number) => (
                    <tr key={s.id_siniestro} className={`border-t border-surface2 ${i % 2 === 1 ? "bg-surface2/10" : ""}`}>
                      <td className="py-2.5 pr-4">
                        <button
                          onClick={() => onNavigateToDetalle?.(s.id_siniestro)}
                          className="font-mono text-xs text-accent hover:text-text hover:underline underline-offset-2"
                        >
                          {s.id_siniestro}
                        </button>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-[#888]">{s.id_asegurado ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-text text-xs">{s.cobertura ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs text-text">
                        {fmtMoney(s.monto_reclamado)}
                      </td>
                      <td className="py-2.5 pr-4 text-center"><ScoreBadge score={s.score_motor} /></td>
                      <td className="py-2.5">
                        {s.semaforo_motor ? <SemBadge sem={s.semaforo_motor} /> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-surface2">
                <span className="text-[#555] text-xs">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.siniestros.length)} de {data.siniestros.length}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="text-xs text-accent hover:text-text disabled:opacity-30 px-2 py-1 rounded border border-surface2"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="text-xs text-accent hover:text-text disabled:opacity-30 px-2 py-1 rounded border border-surface2"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab 3: Grafo de Clúster ───────────────────────────────────

function TabGrafo({
  selectedPrv,
  selectorData,
  onNavigateToDetalle,
}: {
  selectedPrv:         string;
  selectorData:        SelectorPrv[];
  onNavigateToDetalle?:(id: string) => void;
}) {
  const containerRef              = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(800);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setGraphWidth(containerRef.current.clientWidth);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { data, isLoading, isError } = useQuery<GrafoClusterResp>({
    queryKey:  ["relaciones-grafo", selectedPrv],
    queryFn:   () => api.relacionesGrafo(selectedPrv),
    enabled:   !!selectedPrv,
    staleTime: 60_000,
  });

  const graphData = useMemo(() => ({
    nodes: (data?.nodes ?? []).map((n: GrafoNode) => ({ ...n })),
    links: (data?.edges ?? []).map((e: GrafoEdge) => ({ ...e })),
  }), [data]);

  function getNodeColor(node: GrafoNode): string {
    if (node.type === "proveedor") return "#ff6b35";
    if (node.type === "siniestro") return COLORS[(node.semaforo ?? "Verde") as keyof typeof COLORS] ?? "#888";
    if (node.type === "asegurado") return "#4dabf7";
    return "#888";
  }

  function getNodeSize(node: GrafoNode): number {
    return node.type === "proveedor" ? 12 : node.type === "asegurado" ? 5 : 3;
  }

  const nombrePrv = selectorData.find((p) => p.id_proveedor === selectedPrv)?.nombre ?? selectedPrv;

  return (
    <div className="space-y-4">
      {/* Banner informativo */}
      <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 text-sm text-blue-200">
        El grafo muestra el clúster del proveedor seleccionado en <strong>Detalle Proveedor</strong>.
        Seleccioná primero un proveedor en esa pestaña para ver su red de conexiones.
        Clic en un siniestro navega al detalle.
      </div>

      {!selectedPrv ? (
        <p className="text-[#555] text-sm p-4">
          Sin proveedor seleccionado. Ve a la pestaña "Detalle Proveedor".
        </p>
      ) : (
        <>
          {data && (
            <p className="text-sm text-[#888]">
              Clúster de:{" "}
              <span className="text-text font-semibold">{nombrePrv}</span>
              {" — "}
              <span className="text-text">{data.total_nodos} nodos · {data.total_aristas} conexiones</span>
            </p>
          )}

          <div
            ref={containerRef}
            className="bg-[#0a0f1a] rounded-xl border border-surface2 overflow-hidden"
            style={{ height: 500 }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-accent animate-pulse text-sm">
                Construyendo clúster…
              </div>
            ) : isError ? (
              <div className="flex items-center justify-center h-full text-rojo text-sm">
                Error al cargar el grafo.
              </div>
            ) : !data || data.nodes.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[#555] text-sm">
                Sin datos para el proveedor seleccionado.
              </div>
            ) : (
              <ForceGraph2D
                graphData={graphData}
                width={graphWidth}
                height={500}
                backgroundColor="#0a0f1a"
                nodeColor={(n: GrafoNode) => getNodeColor(n)}
                nodeRelSize={4}
                nodeVal={(n: GrafoNode) => getNodeSize(n)}
                nodeLabel={(n: GrafoNode) =>
                  `[${n.type}] ${n.label}${n.score != null ? ` — Score: ${n.score}` : ""}`
                }
                linkColor={() => "#2d3748"}
                linkWidth={1}
                cooldownTicks={100}
                onNodeClick={(node) => {
                  const n = node as unknown as GrafoNode;
                  if (n.type === "siniestro") onNavigateToDetalle?.(n.id);
                }}
              />
            )}
          </div>

          {/* Leyenda estática */}
          <div className="bg-surface rounded-xl border border-surface2 p-4">
            <p className="text-accent text-xs uppercase tracking-wider mb-3 font-semibold">Leyenda</p>
            <div className="flex flex-wrap gap-5">
              {[
                { color: "#ff6b35",       label: "Proveedor (nodo central)",   size: 14 },
                { color: COLORS.Rojo,     label: "Siniestro ROJO",             size: 10 },
                { color: COLORS.Amarillo, label: "Siniestro AMARILLO",         size: 10 },
                { color: COLORS.Verde,    label: "Siniestro VERDE",            size: 10 },
                { color: "#4dabf7",       label: "Asegurado",                  size: 10 },
              ].map(({ color, label, size }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-text">
                  <div style={{ width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────

export default function RedRelaciones({ onNavigateToDetalle }: Props) {
  const [innerTab,    setInnerTab]    = useState<InnerTab>("ranking");
  const [selectedPrv, setSelectedPrv] = useState("");

  const { data: selectorData = [] } = useQuery<SelectorPrv[]>({
    queryKey: ["relaciones-selector"],
    queryFn:  api.relacionesSelector,
  });

  // Auto-seleccionar el proveedor de mayor riesgo al cargar
  useEffect(() => {
    if (selectorData.length > 0 && !selectedPrv) {
      setSelectedPrv(selectorData[0].id_proveedor);
    }
  }, [selectorData, selectedPrv]);

  // Navegar a detalle de proveedor desde la tabla de ranking
  function handleSelectProveedor(id: string) {
    setSelectedPrv(id);
    setInnerTab("detalle");
  }

  return (
    <div className="space-y-4">
      <h2 className="text-text font-semibold">Red de Relaciones</h2>

      {/* Pestañas internas */}
      <div className="flex gap-1 border-b border-surface2">
        {INNER_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setInnerTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              innerTab === t.id
                ? "border-rojo text-text"
                : "border-transparent text-[#666] hover:text-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {innerTab === "ranking" && (
          <TabRanking onSelectProveedor={handleSelectProveedor} />
        )}
        {innerTab === "detalle" && (
          <TabDetalle
            selectedPrv={selectedPrv}
            selectorData={selectorData}
            onSelectPrv={setSelectedPrv}
            onNavigateToDetalle={onNavigateToDetalle}
          />
        )}
        {innerTab === "grafo" && (
          <TabGrafo
            selectedPrv={selectedPrv}
            selectorData={selectorData}
            onNavigateToDetalle={onNavigateToDetalle}
          />
        )}
      </div>
    </div>
  );
}
