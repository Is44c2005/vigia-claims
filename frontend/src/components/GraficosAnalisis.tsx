import { useQuery } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ScatterChart, Scatter,
} from "recharts";
import { api, Filtros } from "../lib/api";
import { COLORS } from "../lib/utils";

const PIE_COLORS = [COLORS.Rojo, COLORS.Amarillo, COLORS.Verde];
const PIE_ORDER  = ["Rojo", "Amarillo", "Verde"];

// ─── Histograma de scores ─────────────────────────────────────
function buildBins(scores: number[], bins = 10): { bin: string; count: number }[] {
  const result = [];
  for (let i = 0; i < bins; i++) {
    const lo  = i * (100 / bins);
    const hi  = lo + 100 / bins;
    result.push({ bin: `${lo.toFixed(0)}-${hi.toFixed(0)}`, count: scores.filter((s) => s >= lo && s < hi).length });
  }
  return result;
}

// ─── Componente ───────────────────────────────────────────────
interface Props { filtros: Filtros; }

export default function GraficosAnalisis({ filtros }: Props) {
  const { data: semData } = useQuery({
    queryKey: ["grafico-sem", filtros.semaforo, filtros.ramo],
    queryFn:  () => api.graficoSemaforo(filtros),
  });
  const { data: scoreData } = useQuery({
    queryKey: ["grafico-score"],
    queryFn:  api.graficoScore,
  });
  const { data: ramoData } = useQuery({
    queryKey: ["grafico-ramo"],
    queryFn:  api.graficoRamo,
  });
  const { data: provData } = useQuery({
    queryKey: ["proveedores"],
    queryFn:  api.proveedores,
  });
  const { data: mlData } = useQuery({
    queryKey: ["grafico-ml"],
    queryFn:  api.graficoML,
  });

  // Transformar ramo data a formato agrupado para stacked bar
  const ramoGrouped: Record<string, Record<string, number>> = {};
  (ramoData ?? []).forEach(({ ramo, semaforo_motor, cnt }: { ramo: string; semaforo_motor: string; cnt: number }) => {
    if (!ramoGrouped[ramo]) ramoGrouped[ramo] = {};
    ramoGrouped[ramo][semaforo_motor] = cnt;
  });
  const ramoChartData = Object.entries(ramoGrouped).map(([ramo, sems]) => ({ ramo, ...sems }));

  // Bins de score por semáforo
  const scoreBins = {
    Rojo:     buildBins((scoreData?.find((s: { semaforo: string; scores: number[] }) => s.semaforo ==="Rojo")?.scores ?? [])),
    Amarillo: buildBins((scoreData?.find((s: { semaforo: string; scores: number[] }) => s.semaforo === "Amarillo")?.scores ?? [])),
    Verde:    buildBins((scoreData?.find((s: { semaforo: string; scores: number[] }) => s.semaforo ==="Verde")?.scores ?? [])),
  };
  const scoreMerged = scoreBins.Rojo.map((b, i) => ({
    bin:      b.bin,
    Rojo:     b.count,
    Amarillo: scoreBins.Amarillo[i].count,
    Verde:    scoreBins.Verde[i].count,
  }));

  // Proveedores: nombres cortos para el chart
  const provChartData = (provData ?? []).map((p: { nombre_proveedor?: string; id_proveedor: string; alertas_rojas: number }) => ({
    nombre:  p.nombre_proveedor ?? p.id_proveedor,
    alertas: p.alertas_rojas,
  })).reverse();

  const tooltipStyle = {
    backgroundColor: "#1d3557",
    border:          "1px solid #2d3748",
    borderRadius:    "8px",
    color:           "#f1faee",
  };

  return (
    <div className="space-y-8">
      {/* Row 1: Semáforo + Score */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Semáforo */}
        <div className="bg-surface rounded-xl border border-surface2 p-5">
          <h3 className="text-text font-semibold mb-4">Distribución Semáforo de Riesgo</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={[...(semData ?? [])].sort((a, b) => PIE_ORDER.indexOf(a.name) - PIE_ORDER.indexOf(b.name))} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3}>
                {[...(semData ?? [])].sort((a, b) => PIE_ORDER.indexOf(a.name) - PIE_ORDER.indexOf(b.name)).map((entry, i) => (
                  <Cell key={entry.name} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v + " siniestros"]} />
              <Legend wrapperStyle={{ color: "#f1faee" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Score distribution */}
        <div className="bg-surface rounded-xl border border-surface2 p-5">
          <h3 className="text-text font-semibold mb-4">Distribución de Score de Riesgo</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={scoreMerged} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis dataKey="bin" tick={{ fill: "#a8dadc", fontSize: 10 }} />
              <YAxis tick={{ fill: "#a8dadc", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: "#f1faee" }} />
              <Bar dataKey="Rojo"     stackId="a" fill={COLORS.Rojo}     radius={[0, 0, 0, 0]} />
              <Bar dataKey="Amarillo" stackId="a" fill={COLORS.Amarillo} />
              <Bar dataKey="Verde"    stackId="a" fill={COLORS.Verde}    radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Proveedores + Ramo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top proveedores */}
        <div className="bg-surface rounded-xl border border-surface2 p-5">
          <h3 className="text-text font-semibold mb-4">Top Proveedores — Alertas Rojas</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={provChartData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis type="number" tick={{ fill: "#a8dadc", fontSize: 11 }} />
              <YAxis type="category" dataKey="nombre" tick={{ fill: "#a8dadc", fontSize: 10 }} width={120} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="alertas" fill={COLORS.Rojo} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Por ramo */}
        <div className="bg-surface rounded-xl border border-surface2 p-5">
          <h3 className="text-text font-semibold mb-4">Siniestros por Ramo y Nivel de Riesgo</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={ramoChartData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis dataKey="ramo" tick={{ fill: "#a8dadc", fontSize: 10 }} />
              <YAxis tick={{ fill: "#a8dadc", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: "#f1faee" }} />
              <Bar dataKey="Rojo"     stackId="a" fill={COLORS.Rojo}     />
              <Bar dataKey="Amarillo" stackId="a" fill={COLORS.Amarillo} />
              <Bar dataKey="Verde"    stackId="a" fill={COLORS.Verde}    radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: ML Scatter (si hay datos) */}
      {mlData && mlData.length > 0 && (
        <div className="bg-surface rounded-xl border border-surface2 p-5">
          <h3 className="text-text font-semibold mb-4">Motor de Reglas vs Modelo ML</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis
                type="number" dataKey="score_motor"
                name="Score Motor" domain={[0, 100]}
                tick={{ fill: "#a8dadc", fontSize: 11 }}
                label={{ value: "Score Motor (0-100)", fill: "#a8dadc", fontSize: 12, position: "insideBottom", offset: -5 }}
              />
              <YAxis
                type="number" dataKey="prob_fraude_ml"
                name="Prob. ML" domain={[0, 1]}
                tick={{ fill: "#a8dadc", fontSize: 11 }}
                label={{ value: "Prob. Fraude ML", fill: "#a8dadc", fontSize: 12, angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, name: string) => [
                  name === "prob_fraude_ml" ? (v * 100).toFixed(1) + "%" : v,
                  name === "prob_fraude_ml" ? "Prob. ML" : "Score Motor",
                ]}
              />
              {(["Rojo", "Amarillo", "Verde"] as const).map((sem) => (
                <Scatter
                  key={sem}
                  name={sem}
                  data={mlData.filter((d: { semaforo_motor?: string }) => d.semaforo_motor === sem)}
                  fill={COLORS[sem]}
                  fillOpacity={0.65}
                />
              ))}
              <Legend wrapperStyle={{ color: "#f1faee" }} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
