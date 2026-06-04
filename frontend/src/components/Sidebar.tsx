import { useQuery } from "@tanstack/react-query";
import { api, Filtros, DEFAULT_FILTROS } from "../lib/api";

interface SidebarProps {
  filtros:    Filtros;
  onChange:   (f: Filtros) => void;
}

const SEMAFOROS = ["Rojo", "Amarillo", "Verde"] as const;

export default function Sidebar({ filtros, onChange }: SidebarProps) {
  const { data: opts } = useQuery({
    queryKey: ["filtros"],
    queryFn:  api.filtros,
  });

  function toggleSem(s: string) {
    const next = filtros.semaforo.includes(s)
      ? filtros.semaforo.filter((x) => x !== s)
      : [...filtros.semaforo, s];
    onChange({ ...filtros, semaforo: next });
  }

  function reset() {
    onChange(DEFAULT_FILTROS);
  }

  return (
    <aside className="w-56 shrink-0 bg-[#12192b] border-r border-surface2 flex flex-col min-h-screen p-4 gap-5">
      {/* Logo */}
      <div className="-mx-4 overflow-hidden h-24 flex items-center justify-center">
        <img
          src="/logo.png"
          alt="VigIA"
          className="w-full h-auto scale-[1.7] origin-center"
          style={{ mixBlendMode: "screen" }}
        />
      </div>

      <hr className="border-surface2" />

      {/* Semáforo */}
      <div>
        <p className="text-accent text-xs font-semibold uppercase tracking-wider mb-2">Nivel de Riesgo</p>
        {SEMAFOROS.map((s) => {
          const checked = filtros.semaforo.includes(s);
          const color = s === "Rojo" ? "#e63946" : s === "Amarillo" ? "#f4a261" : "#2a9d8f";
          return (
            <label key={s} className="flex items-center gap-2.5 py-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={checked} onChange={() => toggleSem(s)} className="sr-only" />
              <div
                className="w-4 h-4 rounded-sm border-2 flex items-center justify-center transition-all shrink-0"
                style={{ backgroundColor: checked ? color : "transparent", borderColor: color }}
              >
                {checked && (
                  <svg viewBox="0 0 10 8" fill="none" stroke="white" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                    <polyline points="1,4 4,7 9,1" />
                  </svg>
                )}
              </div>
              <span className="text-text text-sm">{s}</span>
            </label>
          );
        })}
      </div>

      {/* Ramo */}
      <div>
        <p className="text-accent text-xs font-semibold uppercase tracking-wider mb-1">Ramo</p>
        <select
          value={filtros.ramo}
          onChange={(e) => onChange({ ...filtros, ramo: e.target.value })}
          className="w-full bg-surface2 text-text text-sm rounded p-1.5 border border-surface2 focus:outline-none"
        >
          <option value="Todos">Todos</option>
          {opts?.ramos.map((r: string) => <option key={r}>{r}</option>)}
        </select>
      </div>

      {/* Sucursal */}
      <div>
        <p className="text-accent text-xs font-semibold uppercase tracking-wider mb-1">Sucursal</p>
        <select
          value={filtros.sucursal}
          onChange={(e) => onChange({ ...filtros, sucursal: e.target.value })}
          className="w-full bg-surface2 text-text text-sm rounded p-1.5 border border-surface2 focus:outline-none"
        >
          <option value="Todas">Todas</option>
          {opts?.sucursales.map((s: string) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Cobertura */}
      <div>
        <p className="text-accent text-xs font-semibold uppercase tracking-wider mb-1">Cobertura</p>
        <select
          value={filtros.cobertura}
          onChange={(e) => onChange({ ...filtros, cobertura: e.target.value })}
          className="w-full bg-surface2 text-text text-sm rounded p-1.5 border border-surface2 focus:outline-none"
        >
          <option value="Todas">Todas</option>
          {opts?.coberturas.map((c: string) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Score */}
      <div>
        <style>{`
          .dual-thumb {
            position: absolute; left: 0; top: 0;
            width: 100%; height: 100%;
            -webkit-appearance: none; appearance: none;
            background: transparent; pointer-events: none; outline: none;
          }
          .dual-thumb::-webkit-slider-runnable-track { background: transparent; }
          .dual-thumb::-webkit-slider-thumb {
            -webkit-appearance: none; pointer-events: all; cursor: pointer;
            width: 14px; height: 14px; border-radius: 50%;
            background: #e63946; border: 2px solid #12192b;
          }
          .dual-thumb::-moz-range-track { background: transparent; }
          .dual-thumb::-moz-range-thumb {
            pointer-events: all; cursor: pointer;
            width: 10px; height: 10px; border-radius: 50%;
            background: #e63946; border: 2px solid #12192b; box-sizing: border-box;
          }
        `}</style>
        <p className="text-accent text-xs font-semibold uppercase tracking-wider mb-2">
          Score: {filtros.scoreMin} – {filtros.scoreMax}
        </p>
        <div className="relative h-5">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-surface2 pointer-events-none" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-rojo pointer-events-none"
            style={{ left: `${filtros.scoreMin}%`, right: `${100 - filtros.scoreMax}%` }}
          />
          <input
            type="range" min={0} max={100} value={filtros.scoreMin}
            onChange={(e) => onChange({ ...filtros, scoreMin: Math.min(+e.target.value, filtros.scoreMax) })}
            className="dual-thumb"
            style={{ zIndex: filtros.scoreMin > 50 ? 5 : 3 }}
          />
          <input
            type="range" min={0} max={100} value={filtros.scoreMax}
            onChange={(e) => onChange({ ...filtros, scoreMax: Math.max(+e.target.value, filtros.scoreMin) })}
            className="dual-thumb"
            style={{ zIndex: filtros.scoreMax <= 50 ? 5 : 3 }}
          />
        </div>
      </div>

      <button
        onClick={reset}
        className="mt-auto text-xs text-accent hover:text-text border border-surface2 rounded py-1.5 transition-colors"
      >
        Limpiar filtros
      </button>

      <p className="text-[10px] text-[#555] text-center">
        Alertas de revisión.<br />Decisión final: humana.
      </p>
    </aside>
  );
}
