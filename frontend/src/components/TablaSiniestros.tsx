import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Filtros, Siniestro } from "../lib/api";
import { semBgClass, fmtMoney, fmtPct } from "../lib/utils";

interface Props {
  filtros: Filtros;
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className="text-[#666]">—</span>;
  const cls =
    score >= 76 ? "text-rojo" : score >= 41 ? "text-amarillo" : "text-verde";
  return <span className={`font-bold ${cls}`}>{score}</span>;
}

export default function TablaSiniestros({ filtros }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["siniestros", filtros],
    queryFn:  () => api.siniestros(filtros),
  });

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-48 text-accent animate-pulse">
        Cargando siniestros…
      </div>
    );
  if (isError)
    return (
      <div className="text-rojo p-4">Error al cargar los datos. ¿Está corriendo el backend?</div>
    );

  const rows: Siniestro[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const [exportando, setExportando] = useState(false);

  async function exportarReporte() {
    setExportando(true);
    try { await api.reporteAuditoria(); } finally { setExportando(false); }
  }

  function exportCSV() {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const csv  = [cols.join(","), ...rows.map((r) => cols.map((c) => r[c] ?? "").join(","))].join("\n");
    const a    = document.createElement("a");
    a.href     = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "siniestros_filtrados.csv";
    a.click();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-text font-semibold">
          Siniestros{" "}
          <span className="text-accent text-sm font-normal">
            ({rows.length} mostrados de {total} totales)
          </span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={exportarReporte}
            disabled={exportando}
            className="text-xs bg-rojo hover:bg-red-700 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded transition-colors"
          >
            {exportando ? "Generando…" : "📥 Reporte de Auditoría"}
          </button>
          <button
            onClick={exportCSV}
            className="text-xs bg-surface2 hover:bg-surface text-accent px-3 py-1.5 rounded border border-surface2 transition-colors"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-surface2">
        <table className="w-full text-sm text-left">
          <thead className="bg-surface text-accent text-xs uppercase tracking-wider">
            <tr>
              {["ID Siniestro", "Score", "Semáforo", "Ramo", "Cobertura", "Monto $", "Reglas Críticas", "# Señales", "Prob. ML"].map(
                (h) => (
                  <th key={h} className="px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.id_siniestro + i}
                className="border-t border-surface2 table-row-hover transition-colors"
              >
                <td className="px-4 py-2.5 font-mono text-xs text-accent whitespace-nowrap">
                  {r.id_siniestro}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <ScoreBadge score={r.score_motor} />
                </td>
                <td className="px-4 py-2.5">
                  {r.semaforo_motor ? (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${semBgClass(r.semaforo_motor)}`}
                    >
                      {r.semaforo_motor}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5 text-text">{r.ramo ?? "—"}</td>
                <td className="px-4 py-2.5 text-text whitespace-nowrap">{r.cobertura ?? "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono text-text whitespace-nowrap">
                  {fmtMoney(r.monto_reclamado)}
                </td>
                <td className="px-4 py-2.5 text-xs text-orange-300 max-w-[160px] truncate">
                  {r.reglas_criticas_activadas ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-center text-text">
                  {r.num_señales_motor ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-center text-text">
                  {r.prob_fraude_ml != null ? fmtPct(r.prob_fraude_ml) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
