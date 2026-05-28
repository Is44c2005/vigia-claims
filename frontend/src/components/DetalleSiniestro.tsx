import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { semBgClass, fmtMoney, fmtPct } from "../lib/utils";

interface ExplParsed {
  sinId: string;
  nivel: string;
  score: string;
  semaforo: string;
  ramo: string;
  cobertura: string;
  monto: string;
  proveedor: string;
  reglasCriticas: Array<{ codigo: string; desc: string }>;
  senales: string[];
  accion: string;
}

function stripLeadingSymbols(s: string) {
  return s.replace(/^[\s⚡📋📌⚠️••]+/, "").trim();
}

function parseExplicacionCompleta(text: string): ExplParsed {
  const out: ExplParsed = {
    sinId: "", nivel: "", score: "", semaforo: "",
    ramo: "", cobertura: "", monto: "", proveedor: "",
    reglasCriticas: [], senales: [], accion: "",
  };

  const parts = text.split("||").map(s => s.trim()).filter(Boolean);
  let mode: "none" | "reglas" | "senales" = "none";

  for (const raw of parts) {
    const part = stripLeadingSymbols(raw);

    if (/^ANÁLISIS DE RIESGO/i.test(part)) {
      const m = part.match(/—\s*(SIN-\S+)/);
      if (m) out.sinId = m[1];
      continue;
    }

    if (/Nivel:|Score:|Semáforo:/.test(part)) {
      for (const kv of part.split("|")) {
        const idx = kv.indexOf(":");
        if (idx < 0) continue;
        const k = kv.slice(0, idx).trim();
        const v = kv.slice(idx + 1).trim();
        if (k === "Nivel") out.nivel = v;
        else if (k === "Score") out.score = v;
        else if (k === "Semáforo") out.semaforo = v;
      }
      continue;
    }

    if (/Ramo:|Cobertura:|Monto/.test(part)) {
      for (const kv of part.split("|")) {
        const idx = kv.indexOf(":");
        if (idx < 0) continue;
        const k = kv.slice(0, idx).trim();
        const v = kv.slice(idx + 1).trim();
        if (k === "Ramo") out.ramo = v;
        else if (k === "Cobertura") out.cobertura = v;
        else if (/Monto/i.test(k)) out.monto = v;
      }
      continue;
    }

    if (/^Proveedor:/i.test(part)) {
      out.proveedor = part.replace(/^Proveedor:\s*/i, "");
      continue;
    }

    if (/REGLAS CRÍTICAS ACTIVADAS/i.test(part)) {
      mode = "reglas";
      continue;
    }

    if (mode === "reglas" && /RF-\d+/.test(part)) {
      const m = part.match(/(RF-\d+):\s*(.+)/);
      if (m) out.reglasCriticas.push({ codigo: m[1], desc: m[2].trim() });
      continue;
    }

    if (/SEÑALES DETECTADAS/i.test(part)) {
      mode = "senales";
      continue;
    }

    if (mode === "senales" && /^\d+\./.test(part)) {
      const m = part.match(/^\d+\.\s+(.+)/);
      if (m) out.senales.push(m[1].trim());
      continue;
    }

    if (/ACCIÓN RECOMENDADA/i.test(part)) {
      out.accion = part.replace(/^[^:]+:\s*/i, "").replace(/^⚠️\s*/, "").trim();
      mode = "none";
      continue;
    }
  }

  return out;
}

function ExplicacionMotor({ text, semColor, semBorder }: {
  text: string;
  semColor: string;
  semBorder: string;
}) {
  const d = parseExplicacionCompleta(text);

  const infoRows = [
    ["Nivel de riesgo", d.nivel],
    ["Score",           d.score],
    ["Semáforo",        d.semaforo],
    ["Ramo",            d.ramo],
    ["Cobertura",       d.cobertura],
    ["Monto reclamado", d.monto],
    ["Proveedor",       d.proveedor],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="space-y-4 mt-3">
      {infoRows.length > 0 && (
        <div className="bg-[#0a0f1a] rounded-lg p-4">
          <p className="text-accent text-xs uppercase tracking-wider mb-3 font-semibold">Información General</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {infoRows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-accent text-xs mb-0.5">{k}</dt>
                <dd className="text-text text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {d.reglasCriticas.length > 0 && (
        <div className="bg-[#0a0f1a] rounded-lg p-4">
          <p className="text-accent text-xs uppercase tracking-wider mb-3 font-semibold">Reglas Críticas Activadas</p>
          <ul className="space-y-2">
            {d.reglasCriticas.map((r) => (
              <li key={r.codigo} className="flex gap-2 items-start text-sm text-text">
                <span className="bg-orange-900/50 text-orange-300 text-xs font-bold px-2 py-0.5 rounded shrink-0">
                  {r.codigo}
                </span>
                <span>{r.desc}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.senales.length > 0 && (
        <div className="bg-[#0a0f1a] rounded-lg p-4">
          <p className="text-accent text-xs uppercase tracking-wider mb-3 font-semibold">
            Señales Detectadas ({d.senales.length})
          </p>
          <ol className="space-y-2">
            {d.senales.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-text">
                <span className="text-accent font-mono text-xs shrink-0 mt-0.5">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {d.accion && (
        <div className={`rounded-lg p-4 border ${semBorder} bg-[#0a0f1a]`}>
          <p className="text-accent text-xs uppercase tracking-wider mb-1 font-semibold">Acción Recomendada</p>
          <p className={`text-sm font-medium ${semColor}`}>{d.accion}</p>
        </div>
      )}
    </div>
  );
}

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
              <ExplicacionMotor
                text={String(data.explicacion_alerta)}
                semColor={
                  sem === "Rojo" ? "text-rojo"
                  : sem === "Amarillo" ? "text-amarillo"
                  : "text-verde"
                }
                semBorder={colorBorder}
              />
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
