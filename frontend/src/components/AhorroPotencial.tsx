import MetricCard from "./MetricCard";
import { Estadisticas } from "../lib/api";
import { fmt, fmtMoney } from "../lib/utils";

interface Props {
  stats: Estadisticas;
}

// Tasas referenciales del sector asegurador latinoamericano
const TASA_CONSERVADORA = 0.35;
const TASA_OPTIMISTA    = 0.60;

export default function AhorroPotencial({ stats }: Props) {
  const montoRojo     = stats.monto_riesgo_total;
  const montoAmarillo = stats.monto_riesgo_amarillo ?? 0;

  const ahorroConservador = montoRojo * TASA_CONSERVADORA;
  const ahorroOptimista   = montoRojo * TASA_OPTIMISTA;

  function millones(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    return fmtMoney(n);
  }

  return (
    <div className="bg-surface rounded-xl border border-surface2 p-5 mb-2">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">💰</span>
        <h3 className="text-text font-semibold text-sm uppercase tracking-wide">
          Simulación de Ahorro Potencial
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          title="Monto en Riesgo ALTO"
          value={millones(montoRojo)}
          sub={`${fmt(stats.rojos)} casos Rojo`}
          color="rojo"
        />
        <MetricCard
          title="Monto en Riesgo MEDIO"
          value={millones(montoAmarillo)}
          sub={`${fmt(stats.amarillos)} casos Amarillo`}
          color="amarillo"
        />
        <MetricCard
          title="Casos para Revisión"
          value={fmt(stats.rojos)}
          sub="requieren acción inmediata"
          color="rojo"
        />
        <MetricCard
          title="Ahorro Potencial 35%"
          value={millones(ahorroConservador)}
          sub="estimación conservadora"
          color="verde"
        />
        <MetricCard
          title="Ahorro Potencial 60%"
          value={millones(ahorroOptimista)}
          sub="estimación optimista"
          color="verde"
        />
      </div>

      <p className="text-[#555] text-xs mt-3">
        * Estimación basada en tasa de detección referencial del sector (35–60%). No constituye acusación de fraude. Sujeto a revisión humana obligatoria.
      </p>
    </div>
  );
}
