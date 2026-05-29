import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ForceGraph2D from "react-force-graph-2d";
import { api, GrafoNode, GrafoEdge } from "../lib/api";
import { COLORS } from "../lib/utils";

// Colores por tipo de nodo
const NODE_COLOR: Record<string, string> = {
  asegurado: "#4dabf7",
  proveedor: "#ff922b",
  vehiculo:  "#cc5de8",
};

function getNodeColor(node: GrafoNode): string {
  if (node.type === "siniestro") {
    return COLORS[(node.semaforo ?? "Verde") as keyof typeof COLORS] ?? "#888";
  }
  if (node.type === "proveedor" && node.en_lista_restrictiva) return "#ff1a1a";
  return NODE_COLOR[node.type] ?? "#888";
}

function getNodeSize(node: GrafoNode): number {
  if (node.type === "proveedor")  return 8;
  if (node.type === "asegurado")  return 5;
  if (node.type === "siniestro")  return 4;
  return 3;
}

const LEYENDA = [
  { color: COLORS.Rojo,     label: "Siniestro — Alto riesgo (Rojo)" },
  { color: COLORS.Amarillo, label: "Siniestro — Riesgo medio (Amarillo)" },
  { color: COLORS.Verde,    label: "Siniestro — Bajo riesgo (Verde)" },
  { color: "#4dabf7",       label: "Asegurado" },
  { color: "#ff922b",       label: "Proveedor" },
  { color: "#ff1a1a",       label: "Proveedor en lista restrictiva" },
  { color: "#cc5de8",       label: "Vehículo" },
];

export default function RedRelaciones() {
  const [semaforo,       setSemaforo]       = useState("Rojo,Amarillo");
  const [soloLista,      setSoloLista]      = useState(false);
  const [minConexiones,  setMinConexiones]  = useState(1);
  const [idProveedor,    setIdProveedor]    = useState("");
  const [inputProveedor, setInputProveedor] = useState("");

  // Medir el ancho del contenedor del grafo para pasar a ForceGraph2D
  const containerRef   = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(800);
  useEffect(() => {
    const update = () => {
      if (containerRef.current) setGraphWidth(containerRef.current.clientWidth);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["grafo", semaforo, soloLista, minConexiones, idProveedor],
    queryFn:  () => api.grafo(semaforo, soloLista, minConexiones, idProveedor),
    staleTime: 30_000,
  });

  // Copias frescas para que force-graph no mute el caché de React Query
  const graphData = useMemo(() => ({
    nodes: (data?.nodes ?? []).map((n: GrafoNode) => ({ ...n })),
    links: (data?.edges ?? []).map((e: GrafoEdge) => ({ ...e })),
  }), [data]);

  return (
    <div className="space-y-4">
      <h2 className="text-text font-semibold">Red de Relaciones</h2>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-end gap-5 bg-surface rounded-xl border border-surface2 p-4">
        <div>
          <label className="text-accent text-xs block mb-1">Semáforo</label>
          <select
            value={semaforo}
            onChange={(e) => setSemaforo(e.target.value)}
            className="bg-surface2 text-text text-sm rounded px-2 py-1.5 border border-surface2"
          >
            <option value="Rojo,Amarillo">Críticos (Rojo + Amarillo)</option>
            <option value="Rojo">Solo Rojo</option>
            <option value="Rojo,Amarillo,Verde">Todos</option>
          </select>
        </div>

        <div>
          <label className="text-accent text-xs block mb-1">
            Mín. conexiones: <span className="text-text font-bold">{minConexiones}</span>
          </label>
          <input
            type="range" min={1} max={5} value={minConexiones}
            onChange={(e) => setMinConexiones(Number(e.target.value))}
            className="w-36 accent-rojo"
          />
        </div>

        <div className="flex items-center gap-2 pb-0.5">
          <input
            type="checkbox" id="soloLista" checked={soloLista}
            onChange={(e) => setSoloLista(e.target.checked)}
            className="accent-rojo w-4 h-4"
          />
          <label htmlFor="soloLista" className="text-accent text-xs cursor-pointer">
            Solo proveedores en lista restrictiva
          </label>
        </div>

        <div>
          <label className="text-accent text-xs block mb-1">Filtrar proveedor (ID)</label>
          <div className="flex gap-1">
            <input
              value={inputProveedor}
              onChange={(e) => setInputProveedor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setIdProveedor(inputProveedor.trim())}
              placeholder="PRV-001"
              className="bg-surface2 text-text text-sm rounded px-2 py-1.5 border border-surface2 w-28"
            />
            <button
              onClick={() => setIdProveedor(inputProveedor.trim())}
              className="bg-rojo hover:bg-red-700 text-white text-xs font-bold px-2 py-1.5 rounded transition-colors"
            >
              Ir
            </button>
            {idProveedor && (
              <button
                onClick={() => { setIdProveedor(""); setInputProveedor(""); }}
                className="text-accent text-xs px-2 py-1.5 hover:text-text"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Leyenda + Insight ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-surface2 p-4">
          <p className="text-accent text-xs uppercase tracking-wider mb-3 font-semibold">Leyenda</p>
          <div className="space-y-2">
            {LEYENDA.map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-text">
                <div style={{ width: 11, height: 11, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1 text-[#555] text-xs">
            <p>→ Arista: asegurado → siniestro ("titular")</p>
            <p>→ Arista: proveedor → siniestro ("atendió")</p>
            <p>→ Arista: vehículo → siniestro ("involucrado")</p>
          </div>
        </div>

        <div className="lg:col-span-2 bg-surface rounded-xl border border-surface2 p-4">
          <p className="text-accent text-xs uppercase tracking-wider mb-3 font-semibold">Análisis Automático</p>
          {isLoading && <p className="text-accent animate-pulse text-sm">Construyendo grafo…</p>}
          {isError   && <p className="text-rojo text-sm">Error al cargar el grafo. Verifica que el backend esté activo.</p>}
          {data && (
            <>
              <div className="flex gap-3 mb-3">
                <div className="bg-[#0a0f1a] rounded px-4 py-2 text-center">
                  <p className="text-accent text-xs">Nodos</p>
                  <p className="text-text font-extrabold text-lg">{data.total_nodos}</p>
                </div>
                <div className="bg-[#0a0f1a] rounded px-4 py-2 text-center">
                  <p className="text-accent text-xs">Conexiones</p>
                  <p className="text-text font-extrabold text-lg">{data.total_aristas}</p>
                </div>
              </div>
              {data.insights.top_proveedor && (
                <div className="bg-orange-900/30 border border-orange-700/40 rounded p-3 text-sm text-orange-200">
                  ⚠️ {data.insights.top_proveedor}
                </div>
              )}
              {data.nodes.length === 0 && (
                <p className="text-[#555] text-sm">Sin nodos con los filtros actuales. Prueba reducir el mínimo de conexiones o cambiar el semáforo.</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Grafo ── */}
      <div
        ref={containerRef}
        className="bg-[#0a0f1a] rounded-xl border border-surface2 overflow-hidden"
        style={{ height: 580 }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-accent animate-pulse text-sm">
            Construyendo red de relaciones…
          </div>
        ) : !data || data.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#555] text-sm">
            No hay nodos para mostrar. Ajusta los filtros.
          </div>
        ) : (
          <ForceGraph2D
            graphData={graphData}
            width={graphWidth}
            height={580}
            backgroundColor="#0a0f1a"
            nodeColor={(n: GrafoNode) => getNodeColor(n)}
            nodeRelSize={4}
            nodeVal={(n: GrafoNode) => getNodeSize(n)}
            nodeLabel={(n: GrafoNode) => `[${n.type}] ${n.label}${n.score ? ` — Score: ${n.score}` : ""}`}
            linkColor={() => "#2d3748"}
            linkWidth={1}
            cooldownTicks={120}
          />
        )}
      </div>
    </div>
  );
}
