import { useState } from "react";
import { api, NuevoSiniestroPayload } from "../lib/api";
import { semBgClass, fmtMoney } from "../lib/utils";

const RAMOS      = ["Vehículos", "Salud", "Vida", "Incendio", "Robo", "Responsabilidad Civil"];
const COBERTURAS = ["Robo", "Pérdida Total", "Colisión", "Volcadura", "Responsabilidad Civil", "Atención Médica", "Incendio Comercial"];

const INITIAL: NuevoSiniestroPayload = {
  id_siniestro:                   "SIN-NUEVO",
  ramo:                           "Vehículos",
  cobertura:                      "Colisión",
  monto_reclamado:                15000,
  suma_asegurada:                 20000,
  dias_desde_inicio_poliza:       15,
  dias_entre_ocurrencia_reporte:  2,
  historial_siniestros_asegurado: 1,
  siniestros_vehiculo_18m:        0,
  proveedor_lista_restrictiva:    "No",
  documentos_completos:           "Sí",
  documentos_inconsistentes:      "No",
  descripcion:                    "Vehículo colisionó durante la madrugada sin testigos.",
};

type Resultado = Record<string, unknown>;

function parseExplicacion(text: string): { signals: string[]; action: string; summary: string } {
  const parts = text.split("||").map((s) => s.trim()).filter(Boolean);
  const signals: string[] = [];
  let action = "";
  let summary = "";

  for (const part of parts) {
    const numbered = part.match(/^\d+\.\s+(.+)/s);
    if (numbered) {
      signals.push(numbered[1].trim());
    } else if (/ACCIÓN RECOMENDADA/i.test(part)) {
      action = part.replace(/^[^:]+:\s*/i, "").trim();
    } else if (
      part.length > 30 &&
      !part.includes("SEÑALES") &&
      !part.includes("Score") &&
      !part.includes("Semáforo") &&
      !part.includes("Ramo") &&
      !part.includes("Cobertura") &&
      !part.includes("Monto") &&
      !part.includes("Proveedor") &&
      !part.includes("ANÁLISIS")
    ) {
      if (!summary) summary = part;
    }
  }

  return { signals, action, summary };
}

export default function AnalizarNuevo() {
  const [form,    setForm]    = useState<NuevoSiniestroPayload>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<Resultado | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  function set<K extends keyof NuevoSiniestroPayload>(key: K, val: NuevoSiniestroPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.analizar(form);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const sem   = String(result?.semaforo_motor ?? "");
  const score = result?.score_motor as number | undefined;

  const semColor =
    sem === "Rojo" ? "text-rojo" : sem === "Amarillo" ? "text-amarillo" : "text-verde";
  const semBorderColor =
    sem === "Rojo" ? "border-rojo" : sem === "Amarillo" ? "border-amarillo" : "border-verde";

  const parsed = result?.explicacion_alerta
    ? parseExplicacion(String(result.explicacion_alerta))
    : null;

  return (
    <div>
      <h2 className="text-text font-semibold mb-1">Analizar Siniestro Nuevo</h2>
      <p className="text-accent text-sm mb-5">Ingresa los datos de un nuevo siniestro para evaluar su riesgo inmediatamente.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Fila 1 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="ID Siniestro">
            <input value={form.id_siniestro} onChange={(e) => set("id_siniestro", e.target.value)}
              className="input-dark" />
          </Field>
          <Field label="Ramo">
            <select value={form.ramo} onChange={(e) => set("ramo", e.target.value)} className="input-dark">
              {RAMOS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Cobertura">
            <select value={form.cobertura} onChange={(e) => set("cobertura", e.target.value)} className="input-dark">
              {COBERTURAS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        {/* Fila 2 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Monto Reclamado ($)">
            <input type="number" value={form.monto_reclamado}
              onChange={(e) => set("monto_reclamado", Number(e.target.value))} className="input-dark" />
          </Field>
          <Field label="Suma Asegurada ($)">
            <input type="number" value={form.suma_asegurada}
              onChange={(e) => set("suma_asegurada", Number(e.target.value))} className="input-dark" />
          </Field>
          <Field label="Días desde inicio póliza">
            <input type="number" value={form.dias_desde_inicio_poliza}
              onChange={(e) => set("dias_desde_inicio_poliza", Number(e.target.value))} className="input-dark" />
          </Field>
        </div>

        {/* Fila 3 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Días ocurrencia a reporte">
            <input type="number" value={form.dias_entre_ocurrencia_reporte}
              onChange={(e) => set("dias_entre_ocurrencia_reporte", Number(e.target.value))} className="input-dark" />
          </Field>
          <Field label="Historial siniestros (18m)">
            <input type="number" value={form.historial_siniestros_asegurado}
              onChange={(e) => set("historial_siniestros_asegurado", Number(e.target.value))} className="input-dark" />
          </Field>
          <Field label="Siniestros vehículo (18m)">
            <input type="number" value={form.siniestros_vehiculo_18m}
              onChange={(e) => set("siniestros_vehiculo_18m", Number(e.target.value))} className="input-dark" />
          </Field>
        </div>

        {/* Fila 4 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Proveedor en lista restrictiva">
            <select value={form.proveedor_lista_restrictiva}
              onChange={(e) => set("proveedor_lista_restrictiva", e.target.value)} className="input-dark">
              <option>No</option><option>Sí</option>
            </select>
          </Field>
          <Field label="Documentos completos">
            <select value={form.documentos_completos}
              onChange={(e) => set("documentos_completos", e.target.value)} className="input-dark">
              <option>Sí</option><option>No</option>
            </select>
          </Field>
          <Field label="Documentos inconsistentes">
            <select value={form.documentos_inconsistentes}
              onChange={(e) => set("documentos_inconsistentes", e.target.value)} className="input-dark">
              <option>No</option><option>Sí</option>
            </select>
          </Field>
          <Field label="Descripción">
            <textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)}
              rows={2} className="input-dark resize-none" />
          </Field>
        </div>

        <button type="submit" disabled={loading}
          className="bg-rojo hover:bg-red-700 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-lg transition-colors">
          {loading ? "Analizando…" : "Analizar Riesgo"}
        </button>
      </form>

      {error && <p className="mt-4 text-rojo">{error}</p>}

      {result && (
        <div className={`mt-6 rounded-xl border-l-4 ${semBorderColor} bg-surface p-6 space-y-5`}>

          {/* Veredicto */}
          <div className="flex flex-wrap items-baseline gap-3">
            <span className={`text-2xl font-extrabold ${semColor}`}>{sem}</span>
            {score != null && (
              <span className="text-text text-sm">
                Score de riesgo: <span className="font-bold">{score}/100</span>
              </span>
            )}
            <span className={`px-3 py-0.5 rounded-full text-xs font-bold ${semBgClass(sem)}`}>
              {score != null && score >= 76 ? "Alto Riesgo" : score != null && score >= 41 ? "Riesgo Medio" : "Bajo Riesgo"}
            </span>
          </div>

          {/* Señales en lenguaje natural */}
          {parsed && parsed.signals.length > 0 && (
            <div className="bg-[#162035] rounded-lg p-4">
              <p className="text-accent text-xs uppercase tracking-wider mb-3 font-semibold">
                Señales detectadas ({parsed.signals.length})
              </p>
              <ul className="space-y-2">
                {parsed.signals.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-text">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rojo shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsed && parsed.signals.length === 0 && (
            <div className="bg-[#162035] rounded-lg p-4">
              <p className="text-verde text-sm">Este siniestro no presenta señales de alerta significativas.</p>
            </div>
          )}

          {/* Reglas críticas */}
          {result.reglas_criticas_activadas && String(result.reglas_criticas_activadas).trim() !== "" && (
            <div className="bg-[#162035] rounded-lg p-4">
              <p className="text-accent text-xs uppercase tracking-wider mb-2 font-semibold">Reglas críticas activadas</p>
              <div className="flex flex-wrap gap-1">
                {String(result.reglas_criticas_activadas).split(",").filter(Boolean).map((r) => (
                  <span key={r} className="bg-orange-900/50 text-orange-300 text-xs font-bold px-2 py-0.5 rounded">
                    {r.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Acción recomendada */}
          {parsed && parsed.action && (
            <div className={`rounded-lg p-4 border ${semBorderColor} bg-[#0a0f1a]`}>
              <p className="text-accent text-xs uppercase tracking-wider mb-1 font-semibold">Acción recomendada</p>
              <p className={`text-sm font-medium ${semColor}`}>{parsed.action}</p>
            </div>
          )}

          {parsed && parsed.summary && (
            <p className="text-[#aaa] text-sm">{parsed.summary}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode; }) {
  return (
    <div>
      <label className="text-accent text-xs uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  );
}
