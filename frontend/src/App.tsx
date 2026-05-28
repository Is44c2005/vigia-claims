import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Filtros, DEFAULT_FILTROS } from "./lib/api";
import { fmt, fmtMoney } from "./lib/utils";
import Sidebar           from "./components/Sidebar";
import MetricCard        from "./components/MetricCard";
import TablaSiniestros   from "./components/TablaSiniestros";
import DetalleSiniestro  from "./components/DetalleSiniestro";
import GraficosAnalisis  from "./components/GraficosAnalisis";
import AnalizarNuevo     from "./components/AnalizarNuevo";
import ChatIA            from "./components/ChatIA";

const TABS = [
  { id: "panel",    label: "Panel Principal" },
  { id: "detalle",  label: "Detalle Siniestro" },
  { id: "graficos", label: "Análisis Visual" },
  { id: "nuevo",    label: "Analizar Nuevo" },
  { id: "chat",     label: "Chat con IA" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [tab,     setTab]     = useState<TabId>("panel");
  const [filtros, setFiltros] = useState<Filtros>(DEFAULT_FILTROS);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["estadisticas"],
    queryFn:  api.estadisticas,
  });

  return (
    <div className="flex min-h-screen bg-bg text-text">
      <Sidebar filtros={filtros} onChange={setFiltros} />

      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="border-b border-surface2 px-8 py-4">
          <h1 className="text-2xl font-extrabold text-rojo leading-none">
            VigIA — Detector de Posibles Fraudes
          </h1>
          <p className="text-accent text-xs mt-1">
            hackIAthon 2026 · Aseguradora del Sur · Sistema de Alertas de Revisión
          </p>
        </header>

        {/* Métricas resumen (siempre visibles) */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 px-8 py-5">
            <MetricCard
              title="Total Siniestros"
              value={fmt(stats.total_siniestros)}
              sub="portafolio completo"
              color="blue"
            />
            <MetricCard
              title="Alto Riesgo"
              value={fmt(stats.rojos)}
              sub={`${((stats.rojos / stats.total_siniestros) * 100).toFixed(1)}% del total`}
              color="rojo"
            />
            <MetricCard
              title="Riesgo Medio"
              value={fmt(stats.amarillos)}
              sub={`${((stats.amarillos / stats.total_siniestros) * 100).toFixed(1)}% del total`}
              color="amarillo"
            />
            <MetricCard
              title="Bajo Riesgo"
              value={fmt(stats.verdes)}
              sub={`${((stats.verdes / stats.total_siniestros) * 100).toFixed(1)}% del total`}
              color="verde"
            />
            <MetricCard
              title="Monto en Riesgo"
              value={`$${(stats.monto_riesgo_total / 1_000_000).toFixed(2)}M`}
              sub="solo casos Rojos"
              color="rojo"
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-8 border-b border-surface2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? "border-rojo text-text"
                  : "border-transparent text-[#666] hover:text-accent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="px-8 py-6">
          {tab === "panel"    && <TablaSiniestros  filtros={filtros} />}
          {tab === "detalle"  && <DetalleSiniestro />}
          {tab === "graficos" && <GraficosAnalisis filtros={filtros} />}
          {tab === "nuevo"    && <AnalizarNuevo />}
          {tab === "chat"     && <ChatIA />}
        </div>

        {/* Footer */}
        <footer className="border-t border-surface2 px-8 py-4 text-center text-[#555] text-xs">
          Este sistema genera <strong className="text-[#777]">alertas de revisión</strong>, no acusaciones de fraude.
          La decisión final siempre es del analista humano. Datos 100% sintéticos.
          <br />hackIAthon 2026 · Aseguradora del Sur · Equipo VigIA
        </footer>
      </main>
    </div>
  );
}
