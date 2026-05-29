"""
Utilidad de línea de comandos para generar el reporte ejecutivo en PDF.

Uso:
    python src/utils/export_report.py

Requiere:
    pip install fpdf2

El PDF se guarda en data/processed/reporte_auditoria_YYYY-MM-DD.pdf
"""

import os
import sys
from datetime import date

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "processed")

try:
    import pandas as pd
except ImportError:
    sys.exit("Error: pandas no está instalado. Ejecuta: pip install pandas")

try:
    from fpdf import FPDF
except ImportError:
    sys.exit("Error: fpdf2 no está instalado. Ejecuta: pip install fpdf2")


# ─── Clase PDF personalizada ──────────────────────────────────

class ReportePDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 14)
        self.cell(0, 10, "VigIA — Reporte de Casos de Riesgo", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.cell(0, 6, f"Aseguradora del Sur  |  Generado: {date.today().isoformat()}", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120)
        self.cell(
            0, 10,
            "Este reporte es una herramienta de apoyo para el analista. "
            "No constituye acusación de fraude. Requiere revisión humana.",
            align="C",
        )
        self.set_text_color(0)


def _tabla_resumen(pdf: FPDF, df: pd.DataFrame) -> None:
    """Sección 2: tabla de totales por semáforo."""
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "1. Resumen Ejecutivo", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)

    sem_col = "semaforo_motor" if "semaforo_motor" in df.columns else None
    monto_col = "monto_reclamado" if "monto_reclamado" in df.columns else None

    encabezados = ["Semáforo", "Cantidad", "Monto Total (USD)", "Score Promedio"]
    anchos      = [40, 30, 55, 45]

    # Encabezado de tabla
    pdf.set_fill_color(30, 40, 60)
    pdf.set_text_color(255)
    for h, w in zip(encabezados, anchos):
        pdf.cell(w, 7, h, border=1, fill=True)
    pdf.ln()
    pdf.set_text_color(0)

    for sem in ["Rojo", "Amarillo", "Verde"]:
        sub = df[df[sem_col] == sem] if sem_col else pd.DataFrame()
        cnt     = len(sub)
        monto   = sub[monto_col].sum() if monto_col and not sub.empty else 0
        score   = sub["score_motor"].mean() if "score_motor" in sub.columns and not sub.empty else 0

        pdf.set_fill_color(245, 245, 245)
        pdf.cell(40, 6, sem, border=1)
        pdf.cell(30, 6, str(cnt), border=1, align="R")
        pdf.cell(55, 6, f"${monto:,.2f}", border=1, align="R")
        pdf.cell(45, 6, f"{score:.1f}", border=1, align="R")
        pdf.ln()

    pdf.ln(6)


def _tabla_criticos(pdf: FPDF, df: pd.DataFrame) -> None:
    """Sección 3: tabla detallada solo con casos Rojo."""
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "2. Casos Críticos (Rojo)", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8)

    sem_col = "semaforo_motor" if "semaforo_motor" in df.columns else None
    if not sem_col:
        pdf.cell(0, 6, "No hay datos de semáforo disponibles.", new_x="LMARGIN", new_y="NEXT")
        return

    rojos = df[df[sem_col] == "Rojo"].sort_values("score_motor", ascending=False) \
        if "score_motor" in df.columns else df[df[sem_col] == "Rojo"]

    cols_mostrar = ["id_siniestro", "score_motor", "cobertura", "monto_reclamado",
                    "reglas_criticas_activadas"]
    labels       = ["ID Siniestro", "Score", "Cobertura", "Monto USD", "Reglas Críticas"]
    anchos       = [30, 16, 35, 28, 75]

    # Encabezado
    pdf.set_fill_color(30, 40, 60)
    pdf.set_text_color(255)
    for lbl, w in zip(labels, anchos):
        pdf.cell(w, 7, lbl, border=1, fill=True)
    pdf.ln()
    pdf.set_text_color(0)

    for _, row in rojos.head(40).iterrows():
        vals = [
            str(row.get("id_siniestro", "")),
            str(int(row.get("score_motor", 0))) if pd.notna(row.get("score_motor")) else "—",
            str(row.get("cobertura", ""))[:28],
            f"${float(row.get('monto_reclamado', 0)):,.2f}" if pd.notna(row.get("monto_reclamado")) else "—",
            str(row.get("reglas_criticas_activadas", ""))[:55],
        ]
        pdf.set_fill_color(255, 235, 235)
        for v, w in zip(vals, anchos):
            pdf.cell(w, 6, v, border=1)
        pdf.ln()

    if len(rojos) > 40:
        pdf.set_font("Helvetica", "I", 8)
        pdf.cell(0, 6, f"... y {len(rojos) - 40} casos adicionales. Ver CSV completo.", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 6, "Acción sugerida para todos los casos ROJO: Escalar a Unidad Antifraude. NO proceder con el pago.",
             new_x="LMARGIN", new_y="NEXT")


def generar_reporte_pdf(output_dir: str = OUTPUT_DIR) -> str:
    """Genera el PDF y devuelve la ruta del archivo generado."""
    ruta_analizado = os.path.join(output_dir, "siniestros_analizados.csv")
    if not os.path.exists(ruta_analizado):
        sys.exit(f"No se encontró {ruta_analizado}. Ejecuta fraud_rules.py primero.")

    df = pd.read_csv(ruta_analizado, encoding="utf-8-sig")

    pdf = ReportePDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    _tabla_resumen(pdf, df)
    _tabla_criticos(pdf, df)

    filename = os.path.join(output_dir, f"reporte_auditoria_{date.today().isoformat()}.pdf")
    pdf.output(filename)
    return filename


if __name__ == "__main__":
    ruta = generar_reporte_pdf()
    print(f"Reporte generado: {ruta}")
