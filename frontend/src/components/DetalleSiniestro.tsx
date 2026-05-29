import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Siniestro } from "../lib/api";
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

// ─── Panel de alerta automática (Funcionalidad 1) ─────────────
function PanelAlertaAutomatica({ data }: { data: Siniestro }) {
  const sem = data?.semaforo_motor as string | undefined;
  if (!sem || sem === "Verde") return null;

  const esRojo = sem === "Rojo";

  const señales: string[] = data.señales_motor
    ? String(data.señales_motor).split("|").map((s: string) => s.trim()).filter(Boolean)
    : [];

  const reglasCriticas: string[] = data.reglas_criticas_activadas
    ? String(data.reglas_criticas_activadas).split(",").map((r: string) => r.trim()).filter(Boolean)
    : [];

  const titulo = esRojo
    ? "ALERTA CRÍTICA — Requiere Revisión Inmediata"
    : "ALERTA MEDIA — Revisión Documental Requerida";

  const accion = esRojo
    ? "Escalar INMEDIATAMENTE a Unidad Antifraude. NO proceder con el pago."
    : "Solicitar documentación adicional y verificar con el proveedor antes de proceder.";

  const panelBg    = esRojo ? "bg-red-950/60"    : "bg-orange-950/60";
  const borderCls  = esRojo ? "border-rojo"       : "border-amarillo";
  const titleCls   = esRojo ? "text-red-300"      : "text-orange-300";
  const badgeBg    = esRojo ? "bg-red-900/60 text-red-200"    : "bg-orange-900/60 text-orange-200";
  const rulesBg    = esRojo ? "bg-red-800/60 text-red-100 font-bold" : "bg-orange-800/60 text-orange-100 font-bold";
  const accionCls  = esRojo ? "text-red-200"      : "text-orange-200";

  return (
    <div className={`rounded-xl border-l-4 ${borderCls} ${panelBg} p-5 space-y-3`}>
      {/* Título */}
      <div className="flex items-center gap-2">
        <span className="text-xl">{esRojo ? "⚠️" : "🟡"}</span>
        <h3 className={`font-extrabold text-sm uppercase tracking-wide ${titleCls}`}>
          {titulo}
        </h3>
      </div>

      {/* Reglas críticas (destacadas) */}
      {reglasCriticas.length > 0 && (
        <div>
          <p className="text-xs text-[#aaa] uppercase tracking-wider mb-1.5">Reglas Críticas Activadas</p>
          <div className="flex flex-wrap gap-1.5">
            {reglasCriticas.map((r) => (
              <span key={r} className={`text-xs px-2.5 py-1 rounded-full ${rulesBg}`}>
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Señales */}
      {señales.length > 0 && (
        <div>
          <p className="text-xs text-[#aaa] uppercase tracking-wider mb-1.5">
            Señales Detectadas ({señales.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {señales.map((s) => (
              <span key={s} className={`text-xs px-2.5 py-1 rounded-full ${badgeBg}`}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Acción */}
      <div className={`text-sm font-semibold border-t ${borderCls} pt-3 ${accionCls}`}>
        → {accion}
      </div>
    </div>
  );
}

// ─── Modal de informe de auditoría ────────────────────────────
function ModalInforme({
  idSiniestro, informe, copiado, onCopiar, onCerrar,
}: {
  idSiniestro: string;
  informe: string;
  copiado: boolean;
  onCopiar: () => void;
  onCerrar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCerrar}
    >
      <div
        className="relative flex flex-col bg-[#0d1929] border border-blue-900/40 rounded-xl w-full max-w-[700px] max-h-[80vh] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado fijo */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-blue-900/40 shrink-0">
          <p className="text-blue-300 text-xs uppercase tracking-wider font-semibold truncate">
            Informe de Auditoría — {idSiniestro}
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onCopiar}
              className="text-xs bg-[#1e3a5f] hover:bg-[#1a3050] text-blue-200 px-3 py-1.5 rounded transition-colors border border-blue-900/50"
            >
              {copiado ? "¡Copiado!" : "Copiar al portapapeles"}
            </button>
            <button
              onClick={onCerrar}
              className="text-xs bg-surface2 hover:bg-surface text-accent px-3 py-1.5 rounded transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
        {/* Cuerpo con scroll interno */}
        <div className="overflow-y-auto p-5">
          <pre className="text-text text-sm font-mono whitespace-pre-wrap leading-relaxed">
            {informe}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function DetalleSiniestro({ initialId = "" }: { initialId?: string }) {
  const [inputId,  setInputId]  = useState(initialId);
  const [buscarId, setBuscarId] = useState(initialId);

  // Estado del informe de auditoría (elevado desde InformeAuditoria)
  const [informeLoading, setInformeLoading] = useState(false);
  const [informeText,    setInformeText]    = useState<string | null>(null);
  const [copiado,        setCopiado]        = useState(false);
  const [errMsg,         setErrMsg]         = useState<string | null>(null);

  useEffect(() => {
    if (initialId) {
      setInputId(initialId);
      setBuscarId(initialId);
    }
  }, [initialId]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["siniestro", buscarId],
    queryFn:  () => api.siniestro(buscarId),
    enabled:  !!buscarId,
  });

  function handleBuscar() {
    const id = inputId.trim().toUpperCase();
    if (id) setBuscarId(id);
  }

  function limpiarMarkdown(texto: string): string {
    return texto
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/`(.*?)`/g, "$1");
  }

  async function generarInforme() {
    if (!data) return;
    setInformeLoading(true);
    setErrMsg(null);
    setInformeText(null);

    const hoy = new Date();
    const fecha = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
    const pct   = data.prob_fraude_ml != null ? `${(Number(data.prob_fraude_ml) * 100).toFixed(1)}%` : "—";

    const msg =
`Genera un informe formal de alerta de revisión para el expediente de auditoría del siniestro ${data.id_siniestro}.

Usa exactamente estos datos:
- Siniestro: ${data.id_siniestro}
- Ramo: ${data.ramo ?? "—"}
- Cobertura: ${data.cobertura ?? "—"}
- Monto reclamado: ${data.monto_reclamado ?? "—"}
- Suma asegurada: ${data.suma_asegurada ?? "—"}
- Sucursal: ${data.sucursal ?? "—"}
- Fecha ocurrencia: ${String(data.fecha_ocurrencia ?? "—")}
- Score de riesgo: ${data.score_motor ?? "—"}/100
- Semáforo: ${data.semaforo_motor ?? "—"}
- Reglas críticas activadas: ${data.reglas_criticas_activadas ?? "Ninguna"}
- Señales detectadas: ${data.señales_motor ?? "Ninguna"}
- Probabilidad ML: ${pct}
- Proveedor: ${String(data.nombre_proveedor ?? "—")}
- Proveedor en lista restrictiva: ${String(data.proveedor_lista_restrictiva ?? data.en_lista_restrictiva ?? "—")}
- Documentos completos: ${String(data.documentos_completos ?? "—")}
- Documentos inconsistentes: ${String(data.documentos_inconsistentes ?? "—")}
- Historial siniestros asegurado: ${String(data.historial_siniestros_asegurado ?? "—")}

El informe debe:
- Estar en español formal institucional, sin markdown, sin asteriscos
- Tener este encabezado exacto:
  INFORME DE ALERTA DE REVISIÓN
  Sistema VigIA — Aseguradora del Sur
  Fecha de generación: ${fecha}
- Incluir sección de datos del siniestro
- Incluir sección de nivel de riesgo con justificación
- Explicar cada regla crítica activada en lenguaje no técnico
- Explicar las señales más importantes
- Terminar con la recomendación de acción según el semáforo
- Terminar siempre con este pie de página exacto:
  'Este informe es generado por el sistema VigIA como alerta de revisión. No constituye acusación de fraude. La decisión final corresponde al analista humano designado.'
Responde SOLO con el informe, sin introducciones ni comentarios.

IMPORTANTE: Responde en texto plano sin ningún formato markdown.
No uses asteriscos, no uses almohadillas, no uses guiones como viñetas. Usa solo texto limpio con saltos de línea para separar secciones.`;

    try {
      const res = await api.chat(`informe-${data.id_siniestro}`, msg);
      setInformeText(limpiarMarkdown(res.response));
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setInformeLoading(false);
    }
  }

  async function copiarInforme() {
    if (!informeText) return;
    await navigator.clipboard.writeText(informeText);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const sem   = data?.semaforo_motor ?? "Verde";
  const score = data?.score_motor;
  const colorBorder =
    sem === "Rojo" ? "border-rojo" : sem === "Amarillo" ? "border-amarillo" : "border-verde";
  const showInformeBtn = !!data && sem !== "Verde";

  return (
    <div>
      <h2 className="text-text font-semibold mb-4">Vista Detalle de Siniestro</h2>

      {/* Barra búsqueda + botón informe */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex gap-2">
          <input
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
            placeholder="Ej: SIN-0064"
            className="w-36 bg-surface2 text-text text-sm rounded px-3 py-2 border border-surface2 focus:border-accent focus:outline-none"
          />
          <button
            onClick={handleBuscar}
            className="bg-rojo hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded transition-colors"
          >
            Ver Detalle
          </button>
        </div>

        {showInformeBtn && (
          <div className="flex-1 flex justify-end items-center gap-3">
            {errMsg && <p className="text-rojo text-xs">{errMsg}</p>}
            <button
              onClick={generarInforme}
              disabled={informeLoading}
              className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#1a3050] disabled:opacity-50 text-blue-200 text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-blue-900/50 whitespace-nowrap"
            >
              <span>📋</span>
              <span>{informeLoading ? "Generando informe…" : "Generar Informe para Auditoría"}</span>
            </button>
          </div>
        )}
      </div>

      {isLoading && <p className="text-accent animate-pulse">Cargando siniestro…</p>}
      {isError   && <p className="text-rojo">{(error as Error).message}</p>}

      {data && (
        <div className="space-y-4">
        <PanelAlertaAutomatica data={data} />
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
        </div>
      )}

      {/* Modal de informe — overlay flotante */}
      {informeText && (
        <ModalInforme
          idSiniestro={data?.id_siniestro ?? ""}
          informe={informeText}
          copiado={copiado}
          onCopiar={copiarInforme}
          onCerrar={() => setInformeText(null)}
        />
      )}
    </div>
  );
}
