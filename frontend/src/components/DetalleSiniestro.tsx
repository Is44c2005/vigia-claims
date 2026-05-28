import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { semBgClass, fmtMoney, fmtPct } from "../lib/utils";

export default function DetalleSiniestro() {
  const [inputId, setInputId] = useState("");
  const [buscarId, setBuscarId] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["siniestro", buscarId],
    queryFn:  () => api.siniestro(buscarId),
    enabled:  !!buscarId,
  });

  function handleBuscar() {
    const id = inputId.trim().toUpperCase();
    if (id) setBuscarId(id);
  }

  const sem   = data?.semaforo_motor ?? "Verde";
  const score = data?.score_motor;
  const colorBorder =
    sem === "Rojo" ? "border-rojo" : sem === "Amarillo" ? "border-amarillo" : "border-verde";

  return (
    <div>
      <h2 className="text-text font-semibold mb-4">Vista Detalle de Siniestro</h2>

      {/* Búsqueda */}
      <div className="flex gap-2 mb-6 max-w-sm">
        <input
          value={inputId}
          onChange={(e) => setInputId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
          placeholder="Ej: SIN-0064"
          className="flex-1 bg-surface2 text-text text-sm rounded px-3 py-2 border border-surface2 focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleBuscar}
          className="bg-rojo hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded transition-colors"
        >
          Ver Detalle
        </button>
      </div>

      {isLoading && (
        <p className="text-accent animate-pulse">Cargando siniestro…</p>
      )}
      {isError && (
        <p className="text-rojo">{(error as Error).message}</p>
      )}

      {data && (
        <div className={`rounded-xl border-l-4 ${colorBorder} bg-surface p-6 space-y-5`}>
          {/* Header */}
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-bold text-text font-mono">{data.id_siniestro}</h3>
            {score != null && (
              <span className="text-sm text-[#aaa]">Score: <span className="font-bold text-text">{score}/100</span></span>
            )}
            {sem && (
              <span className={`px-3 py-0.5 rounded-full text-sm font-bold ${semBgClass(sem)}`}>
                {sem}
              </span>
            )}
          </div>

          {/* Métricas clave */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "Ramo",              val: data.ramo },
              { label: "Cobertura",         val: data.cobertura },
              { label: "Monto Reclamado",   val: fmtMoney(data.monto_reclamado) },
              { label: "Suma Asegurada",    val: fmtMoney(data.suma_asegurada) },
              { label: "Estado",            val: data.estado },
              { label: "Sucursal",          val: data.sucursal },
            ].map(({ label, val }) => (
              <div key={label} className="bg-[#162035] rounded-lg p-3">
                <p className="text-accent text-xs uppercase tracking-wider mb-1">{label}</p>
                <p className="text-text font-semibold text-sm">{val ?? "—"}</p>
              </div>
            ))}
          </div>

          {/* ML */}
          {data.prob_fraude_ml != null && (
            <div className="flex gap-4">
              <div className="bg-[#162035] rounded-lg p-3">
                <p className="text-accent text-xs uppercase tracking-wider mb-1">Prob. Fraude ML</p>
                <p className="text-rojo font-bold text-lg">{fmtPct(data.prob_fraude_ml)}</p>
              </div>
              <div className="bg-[#162035] rounded-lg p-3">
                <p className="text-accent text-xs uppercase tracking-wider mb-1">Nivel Riesgo ML</p>
                <p className="text-text font-semibold">{data.nivel_riesgo_ml ?? "—"}</p>
              </div>
            </div>
          )}

          {/* Reglas críticas */}
          {data.reglas_criticas_activadas && (
            <div>
              <p className="text-accent text-xs uppercase tracking-wider mb-2">Reglas Críticas Activadas</p>
              <div className="flex flex-wrap gap-1">
                {String(data.reglas_criticas_activadas)
                  .split(",")
                  .filter(Boolean)
                  .map((r) => (
                    <span key={r} className="bg-orange-900/50 text-orange-300 text-xs font-bold px-2 py-0.5 rounded">
                      {r.trim()}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Señales */}
          {data.señales_motor && (
            <div>
              <p className="text-accent text-xs uppercase tracking-wider mb-2">
                Señales Detectadas ({data.num_señales_motor ?? 0})
              </p>
              <div className="flex flex-wrap gap-1">
                {String(data.señales_motor)
                  .split("|")
                  .filter(Boolean)
                  .map((s) => (
                    <span key={s} className="bg-red-900/50 text-red-300 text-xs font-bold px-2 py-0.5 rounded">
                      {s.split(":")[0].trim()}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Explicación */}
          {data.explicacion_alerta && (
            <details className="group">
              <summary className="cursor-pointer text-accent text-sm hover:text-text select-none">
                Explicación completa del motor de reglas
              </summary>
              <pre className="mt-2 bg-[#0a0f1a] rounded p-3 text-xs text-[#ccc] whitespace-pre-wrap overflow-x-auto">
                {String(data.explicacion_alerta)}
              </pre>
            </details>
          )}

          {/* Descripción */}
          {data.descripcion && (
            <details>
              <summary className="cursor-pointer text-accent text-sm hover:text-text select-none">
                Descripción del siniestro
              </summary>
              <p className="mt-2 text-text text-sm bg-[#0a0f1a] rounded p-3">
                {String(data.descripcion)}
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
