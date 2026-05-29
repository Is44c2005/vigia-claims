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
      <div className="flex items-center gap-2 py-2">
        <div>
          <p className="text-text font-bold text-lg leading-none">VigIA</p>
          <p className="text-accent text-[10px] uppercase tracking-widest">Detector de Fraudes</p>
        </div>
      </div>

      <hr className="border-surface2" />

      {/* Semáforo */}
      <div>
        <p className="text-accent text-xs font-semibold uppercase tracking-wider mb-2">Nivel de Riesgo</p>
        {SEMAFOROS.map((s) => {
          const checked = filtros.semaforo.includes(s);
          const dot = s === "Rojo" ? "bg-rojo" : s === "Amarillo" ? "bg-amarillo" : "bg-verde";
          return (
            <label key={s} className="flex items-center gap-2 py-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleSem(s)}
                className="accent-rojo"
              />
              <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
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
        <p className="text-accent text-xs font-semibold uppercase tracking-wider mb-1">
          Score: {filtros.scoreMin} – {filtros.scoreMax}
        </p>
        <input
          type="range" min={0} max={100} value={filtros.scoreMin}
          onChange={(e) => onChange({ ...filtros, scoreMin: Number(e.target.value) })}
          className="w-full accent-rojo"
        />
        <input
          type="range" min={0} max={100} value={filtros.scoreMax}
          onChange={(e) => onChange({ ...filtros, scoreMax: Number(e.target.value) })}
          className="w-full accent-rojo"
        />
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
