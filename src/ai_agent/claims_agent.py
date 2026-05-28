"""
=============================================================
hackIAthon 2026 — Reto Aseguradora del Sur
Agente Conversacional con IA — claims_agent.py
=============================================================
Responsabilidades:
  1. Responder preguntas en lenguaje natural sobre los datos
  2. Usar OpenAI API (gpt-4o) como LLM
  3. Construir contexto enriquecido con los datos del dataset
  4. Generar respuestas explicativas con lenguaje de "posible fraude"
  5. Mantener historial de conversación para preguntas de seguimiento
=============================================================
"""

import os
import sys
import json
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional
from openai import OpenAI

# Forzar UTF-8 en Windows para que los emojis en print no rompan el servidor
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ─────────────────────────────────────────────
# RUTAS
# ─────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR   = os.path.join(BASE_DIR, "data", "synthetic")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "processed")

# ─────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────
MODEL = "gpt-4o"
MAX_TOKENS = 1500
MAX_TURNS  = 20  # máximo de turnos antes de resetear historial

# ─────────────────────────────────────────────
# 1. CARGA Y PREPARACIÓN DE CONTEXTO
# ─────────────────────────────────────────────

def cargar_contexto(data_dir: str = DATA_DIR, output_dir: str = OUTPUT_DIR) -> dict:
    """
    Carga los datos procesados y construye el contexto que el agente
    necesita para responder preguntas.
    Retorna un dict con estadísticas resumidas y datos clave.
    """
    contexto = {}

    # ── Cargar siniestros analizados (salida del motor de reglas) ─
    ruta_analizado = os.path.join(output_dir, "siniestros_analizados.csv")
    ruta_con_ml    = os.path.join(output_dir, "siniestros_con_ml.csv")
    ruta_sin_raw   = os.path.join(data_dir,   "siniestros.csv")

    # Intentar cargar con ML primero, luego motor, luego raw
    df = None
    if os.path.exists(ruta_analizado):
        df = pd.read_csv(ruta_analizado, encoding="utf-8-sig")
        contexto["fuente"] = "motor_reglas"
    elif os.path.exists(ruta_sin_raw):
        df = pd.read_csv(ruta_sin_raw, encoding="utf-8-sig")
        contexto["fuente"] = "raw"

    if os.path.exists(ruta_con_ml):
        df_ml = pd.read_csv(ruta_con_ml, encoding="utf-8-sig")
        if df is not None and "prob_fraude_ml" not in df.columns:
            df = df.merge(
                df_ml[["id_siniestro", "prob_fraude_ml", "pred_fraude_ml", "nivel_riesgo_ml"]],
                on="id_siniestro", how="left"
            )

    if df is None:
        raise FileNotFoundError(
            "No se encontraron datos procesados. "
            "Ejecuta primero fraud_rules.py y/o fraud_model.py"
        )

    contexto["df"] = df

    # ── Estadísticas globales ─────────────────────────────────────
    stats = {}
    stats["total_siniestros"] = len(df)

    # Semáforo (del motor de reglas o del CSV raw)
    sem_col = "semaforo_motor" if "semaforo_motor" in df.columns else "semaforo"
    if sem_col in df.columns:
        dist = df[sem_col].value_counts().to_dict()
        stats["rojos"]     = int(dist.get("Rojo", 0))
        stats["amarillos"] = int(dist.get("Amarillo", 0))
        stats["verdes"]    = int(dist.get("Verde", 0))
    else:
        stats["rojos"] = stats["amarillos"] = stats["verdes"] = 0

    # Score (del motor de reglas)
    sc_col = "score_motor" if "score_motor" in df.columns else "score_riesgo"
    if sc_col in df.columns:
        stats["score_promedio"]    = round(float(df[sc_col].mean()), 1)
        stats["score_max"]         = int(df[sc_col].max())

    # Monto en riesgo (casos Rojo)
    if sem_col in df.columns and "monto_reclamado" in df.columns:
        df_rojo = df[df[sem_col] == "Rojo"]
        stats["monto_riesgo_total"] = round(float(df_rojo["monto_reclamado"].sum()), 2)
    else:
        stats["monto_riesgo_total"] = 0

    # Distribución por ramo
    if "ramo" in df.columns:
        stats["por_ramo"] = df["ramo"].value_counts().head(5).to_dict()

    # Distribución geográfica por sucursal/ciudad
    if "sucursal" in df.columns:
        stats["total_por_sucursal"] = df["sucursal"].value_counts().to_dict()
        if sem_col in df.columns:
            df_rojo_geo = df[df[sem_col] == "Rojo"]
            stats["rojos_por_sucursal"]  = df_rojo_geo["sucursal"].value_counts().to_dict()
            df_sospechosos_geo = df[df[sem_col].isin(["Rojo", "Amarillo"])]
            stats["alertas_por_sucursal"] = df_sospechosos_geo["sucursal"].value_counts().to_dict()
            if "monto_reclamado" in df.columns:
                stats["monto_riesgo_por_sucursal"] = (
                    df_rojo_geo.groupby("sucursal")["monto_reclamado"].sum()
                    .sort_values(ascending=False).round(2).to_dict()
                )

    # Etiqueta fraude
    if "etiqueta_fraude_simulada" in df.columns:
        stats["fraude_confirmado"] = int(df["etiqueta_fraude_simulada"].sum())

    # ML stats
    if "prob_fraude_ml" in df.columns:
        stats["prob_fraude_ml_promedio"] = round(float(df["prob_fraude_ml"].mean()), 3)
        stats["alto_riesgo_ml"]          = int((df["nivel_riesgo_ml"] == "Alto").sum())

    contexto["stats"] = stats

    # ── TOP 10 siniestros más riesgosos ──────────────────────────
    df_sorted = df.copy()
    if sc_col in df_sorted.columns:
        df_sorted = df_sorted.sort_values(sc_col, ascending=False)

    cols_top = [c for c in [
        "id_siniestro", sc_col, sem_col, "ramo", "cobertura",
        "monto_reclamado", "reglas_criticas_activadas",
        "num_señales_motor", "señales_motor", "prob_fraude_ml",
        "id_proveedor", "id_asegurado", "sucursal"
    ] if c in df_sorted.columns]

    contexto["top10"] = df_sorted.head(10)[cols_top].to_dict(orient="records")

    # ── Proveedores con alertas ────────────────────────────────────
    prv_ruta = os.path.join(data_dir, "proveedores.csv")
    if os.path.exists(prv_ruta):
        prv = pd.read_csv(prv_ruta, encoding="utf-8-sig")
        if "id_proveedor" in df.columns:
            df_rojo_prv = df[df[sem_col] == "Rojo"] if sem_col in df.columns else df
            conteo_prv  = df_rojo_prv.groupby("id_proveedor").size().reset_index(name="alertas_rojas")
            conteo_prv  = conteo_prv.merge(prv[["id_proveedor", "nombre_proveedor",
                                                  "en_lista_restrictiva",
                                                  "porcentaje_casos_observados"]], on="id_proveedor", how="left")
            conteo_prv  = conteo_prv.sort_values("alertas_rojas", ascending=False)
            contexto["top_proveedores"] = conteo_prv.head(10).to_dict(orient="records")

    # ── Patrones entre casos sospechosos ──────────────────────────
    if sem_col in df.columns:
        df_sospechosos = df[df[sem_col].isin(["Rojo", "Amarillo"])]
        contexto["patrones"] = {
            "cobertura_frecuente": df_sospechosos["cobertura"].value_counts().head(5).to_dict()
                                   if "cobertura" in df_sospechosos.columns else {},
            "ramo_frecuente":      df_sospechosos["ramo"].value_counts().head(5).to_dict()
                                   if "ramo" in df_sospechosos.columns else {},
            "sucursal_frecuente":  df_sospechosos["sucursal"].value_counts().head(10).to_dict()
                                   if "sucursal" in df_sospechosos.columns else {},
        }

    return contexto


def obtener_detalle_siniestro(id_siniestro: str, df: pd.DataFrame) -> Optional[dict]:
    """Retorna el dict completo de un siniestro dado su ID."""
    fila = df[df["id_siniestro"] == id_siniestro]
    if fila.empty:
        return None
    return fila.iloc[0].to_dict()


# ─────────────────────────────────────────────
# 2. CONSTRUCCIÓN DEL SYSTEM PROMPT
# ─────────────────────────────────────────────

def construir_system_prompt(contexto: dict) -> str:
    """
    Construye el system prompt del agente con el contexto del dataset.
    """
    stats = contexto.get("stats", {})
    top10 = contexto.get("top10", [])
    top_prv = contexto.get("top_proveedores", [])
    patrones = contexto.get("patrones", {})

    top10_txt   = json.dumps(top10,      ensure_ascii=False, indent=2)
    top_prv_txt = json.dumps(top_prv[:8], ensure_ascii=False, indent=2)

    # Sección geográfica
    alertas_geo    = stats.get("alertas_por_sucursal", {})
    rojos_geo      = stats.get("rojos_por_sucursal", {})
    monto_geo      = stats.get("monto_riesgo_por_sucursal", {})
    total_geo      = stats.get("total_por_sucursal", {})
    geo_rows = []
    for ciudad, alertas in sorted(alertas_geo.items(), key=lambda x: -x[1]):
        rojos  = rojos_geo.get(ciudad, 0)
        monto  = monto_geo.get(ciudad, 0)
        total  = total_geo.get(ciudad, 0)
        geo_rows.append(
            f"  {ciudad}: {alertas} alertas (Rojo+Amarillo) | {rojos} rojos | "
            f"${monto:,.0f} en riesgo | {total} siniestros totales"
        )
    geo_txt = "\n".join(geo_rows) if geo_rows else "  (datos geográficos no disponibles)"
    suc_frecuente = patrones.get("sucursal_frecuente", {})

    system = f"""Eres VigIA, un asistente especializado en detección de posibles fraudes
en siniestros de seguros para Aseguradora del Sur (Ecuador).

PRINCIPIOS FUNDAMENTALES:
- Generas ALERTAS DE REVISIÓN, nunca acusaciones de fraude definitivas.
- La decisión final SIEMPRE es del analista humano.
- Usas lenguaje de "posible fraude", "requiere revisión", "presenta señales de alerta".
- Eres preciso, explicativo y orientado a ayudar al equipo de investigación.
- Respondes SIEMPRE en español, en texto plano sin formato markdown.
- No uses asteriscos, almohadillas (#) ni otros marcadores de markdown.
- Escribe en párrafos y listas simples con guiones o numeración.
- Cuando cites cifras, sé exacto con los datos del contexto.

ESTADO ACTUAL DEL PORTAFOLIO:
- Total siniestros analizados: {stats.get('total_siniestros', 0):,}
- Semáforo Rojo (alto riesgo): {stats.get('rojos', 0)} siniestros
- Semáforo Amarillo (riesgo medio): {stats.get('amarillos', 0)} siniestros
- Semáforo Verde (bajo riesgo): {stats.get('verdes', 0)} siniestros
- Monto total en riesgo (casos Rojos): ${stats.get('monto_riesgo_total', 0):,.2f}
- Score promedio del portafolio: {stats.get('score_promedio', 0)}/100
- Casos con fraude confirmado (etiqueta simulada): {stats.get('fraude_confirmado', 0)}
{f"- Modelo ML (Random Forest, AUC-ROC=0.93): {stats.get('alto_riesgo_ml', 0)} casos en riesgo alto" if stats.get('alto_riesgo_ml') else ""}

TOP 10 SINIESTROS CON MAYOR RIESGO:
{top10_txt}

TOP PROVEEDORES CON MÁS ALERTAS ROJAS:
{top_prv_txt}

DISTRIBUCIÓN GEOGRÁFICA (por sucursal/ciudad):
{geo_txt}

DISTRIBUCIÓN GEOGRÁFICA (alertas por sucursal/ciudad):
{geo_txt}

PATRONES EN CASOS SOSPECHOSOS:
- Coberturas más frecuentes en alertas: {patrones.get('cobertura_frecuente', {})}
- Ramos más frecuentes en alertas: {patrones.get('ramo_frecuente', {})}
- Ciudades con más alertas (Rojo+Amarillo): {suc_frecuente}
- Sucursales/ciudades más frecuentes en alertas: {suc_frecuente}

SEÑALES DE FRAUDE DEL MOTOR DE REGLAS (21 señales ponderadas):
S01: Siniestro ≤10 días de inicio póliza (8pts crítico)
S02: Siniestro 11-30 días de inicio (4pts medio)
S03: Demora denuncia robo >48h (8pts)
S04: Demora denuncia robo 24-48h (4pts)
S05: Asegurado con ≥3 siniestros en 18m (8pts)
S06: Asegurado con 2 siniestros en 18m (4pts)
S07: Conductor en ≥3 siniestros (8pts) | S08: en 2 (4pts)
S09: Vehículo en ≥3 siniestros (6pts) | S09b: en 2 (3pts)
S10: Solo RC repetida (6pts)
S11: Proveedor en lista restrictiva (10pts)
S12: Proveedor con >30% casos observados (5pts)
S13: Documentos incompletos (4pts)
S14: Dinámica sospechosa/volcadura (6pts)
S15: Sin tercero identificado (5pts)
S16: Documentos inconsistentes/alterados (10pts)
S17: Reporte tardío >7 días (5pts) | S18: 4-7 días (3pts)
S19: Narrativa similar ≥85% (8pts) | S20: 70-84% (4pts)
S21: Monto cercano a suma asegurada >95% (4pts)

REGLAS CRÍTICAS (elevan automáticamente a Rojo/Amarillo):
RF-01: Pérdida Total por Robo con demora → Rojo
RF-02: Adulteración documental confirmada → Rojo
RF-03: Proveedor en lista restrictiva → Rojo
RF-04: Dinámica físicamente imposible → Rojo
RF-05: Siniestro en <2 días de póliza → Amarillo
RF-06: Demora denuncia robo >4 días → Amarillo
RF-07: Narrativa clonada ≥85% similitud → Amarillo

CLASIFICACIÓN SEMÁFORO: Verde (score ≤40) | Amarillo (41-75) | Rojo (≥76)

Cuando te pregunten por un siniestro específico, explica sus señales activadas,
el score, el semáforo y las reglas críticas. Si tienes datos de ML, menciona también
la probabilidad del modelo supervisado. Siempre termina con la acción sugerida:
- Rojo: "Se recomienda revisión URGENTE por el equipo de investigación de fraudes."
- Amarillo: "Se recomienda revisión prioritaria antes de proceder al pago."
- Verde: "Puede continuar el proceso regular de liquidación."""

    return system


# ─────────────────────────────────────────────
# 3. CLASE AGENTE CONVERSACIONAL
# ─────────────────────────────────────────────

class ClaimsAgent:
    """
    Agente conversacional para análisis de siniestros.
    Mantiene historial de conversación multi-turno.
    """

    def __init__(self, data_dir: str = DATA_DIR, output_dir: str = OUTPUT_DIR):
        self.client     = OpenAI()
        self.contexto   = cargar_contexto(data_dir, output_dir)
        self.system     = construir_system_prompt(self.contexto)
        self.historial  = []   # lista de {"role": ..., "content": ...}
        self.df         = self.contexto["df"]
        print("VigIA inicializado correctamente")
        print(f"   Siniestros cargados: {len(self.df):,}")
        print(f"   Rojos: {self.contexto['stats'].get('rojos', 0)} | "
              f"Amarillos: {self.contexto['stats'].get('amarillos', 0)} | "
              f"Verdes: {self.contexto['stats'].get('verdes', 0)}")

    def _enriquecer_pregunta(self, pregunta: str) -> str:
        """
        Si la pregunta menciona un ID de siniestro específico,
        inyecta los datos de ese siniestro en el mensaje.
        """
        import re
        ids = re.findall(r"SIN-\d{4}", pregunta.upper())
        if not ids:
            return pregunta

        contexto_extra = []
        for id_sin in ids:
            detalle = obtener_detalle_siniestro(id_sin, self.df)
            if detalle:
                # Limpiar NaN para JSON
                detalle_limpio = {
                    k: (None if (isinstance(v, float) and np.isnan(v)) else v)
                    for k, v in detalle.items()
                }
                contexto_extra.append(
                    f"\n[DATOS COMPLETOS DE {id_sin}]:\n"
                    + json.dumps(detalle_limpio, ensure_ascii=False, indent=2)
                )

        if contexto_extra:
            return pregunta + "\n" + "\n".join(contexto_extra)
        return pregunta

    def chat(self, pregunta: str) -> str:
        """
        Procesa una pregunta y retorna la respuesta del agente.
        Mantiene el historial de conversación.
        """
        # Enriquecer si hay IDs específicos
        pregunta_enriquecida = self._enriquecer_pregunta(pregunta)

        # Agregar al historial
        self.historial.append({
            "role":    "user",
            "content": pregunta_enriquecida
        })

        # Limitar historial para no superar context window
        if len(self.historial) > MAX_TURNS * 2:
            self.historial = self.historial[-MAX_TURNS * 2:]

        # Llamar a OpenAI API
        response = self.client.chat.completions.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            messages=[{"role": "system", "content": self.system}] + self.historial
        )

        respuesta = response.choices[0].message.content

        # Guardar respuesta en historial
        self.historial.append({
            "role":    "assistant",
            "content": respuesta
        })

        return respuesta

    def resetear_historial(self):
        """Limpia el historial de conversación."""
        self.historial = []
        print("🔄 Historial de conversación reseteado")

    def generar_resumen_ejecutivo(self) -> str:
        """
        Genera automáticamente un resumen ejecutivo del portafolio.
        """
        prompt = (
            "Genera un resumen ejecutivo completo del estado actual del portafolio "
            "de siniestros. Incluye: (1) Estadísticas generales con semáforo, "
            "(2) Top 5 casos más urgentes con su justificación, "
            "(3) Patrones identificados entre los casos sospechosos, "
            "(4) Proveedores que concentran el mayor riesgo, "
            "(5) Recomendaciones de acción inmediata. "
            "Usa un tono ejecutivo, preciso y orientado a la acción. "
            "Recuerda que todas las alertas requieren revisión humana."
        )
        return self.chat(prompt)

    def analizar_siniestro_por_id(self, id_siniestro: str) -> str:
        """
        Análisis detallado de un siniestro específico.
        """
        prompt = (
            f"Analiza en detalle el siniestro {id_siniestro}. "
            "Explica: (1) Por qué fue clasificado con ese nivel de riesgo, "
            "(2) Qué señales específicas se activaron y por qué son relevantes, "
            "(3) Si hay reglas críticas activas, cuáles y qué implican, "
            "(4) La probabilidad de fraude del modelo ML si está disponible, "
            "(5) Qué debería revisar el analista de investigación específicamente, "
            "(6) La acción recomendada. "
            "Usa lenguaje claro y enfocado en hechos observables."
        )
        return self.chat(prompt)

    def top_siniestros_riesgo(self, n: int = 10) -> str:
        """Retorna los N siniestros con mayor riesgo."""
        prompt = (
            f"¿Cuáles son los {n} siniestros con mayor riesgo en el portafolio? "
            "Para cada uno indica: ID, score, semáforo, cobertura, monto reclamado, "
            "y las 2-3 principales razones de la alerta. "
            "Ordénalos de mayor a menor riesgo y destaca los que tienen "
            "reglas críticas activas."
        )
        return self.chat(prompt)

    def analizar_proveedores(self) -> str:
        """Análisis de proveedores con mayor concentración de alertas."""
        prompt = (
            "¿Qué proveedores concentran el mayor número de alertas rojas? "
            "Identifica los que aparecen en lista restrictiva, "
            "calcula qué porcentaje del monto total en riesgo representa cada uno, "
            "y señala si existe un patrón de concentración sospechosa. "
            "Incluye una recomendación de acción para los proveedores más riesgosos."
        )
        return self.chat(prompt)

    def patrones_sospechosos(self) -> str:
        """Identifica patrones repetidos en casos sospechosos."""
        prompt = (
            "¿Qué patrones se repiten entre los siniestros sospechosos (Amarillo y Rojo)? "
            "Analiza: tipos de cobertura más frecuentes, ramos, señales más activadas, "
            "días de demora típicos, y si hay correlación entre variables. "
            "¿Hay algún perfil de siniestro sospechoso recurrente?"
        )
        return self.chat(prompt)


# ─────────────────────────────────────────────
# 4. INTERFAZ DE LÍNEA DE COMANDOS (para testing)
# ─────────────────────────────────────────────

def modo_interactivo():
    """
    Inicia una sesión de chat interactiva con el agente.
    Útil para testing y para la demo del jurado.
    """
    print("\n" + "="*60)
    print("🤖 FRAUDIA INVESTIGATOR — Modo Interactivo")
    print("="*60)
    print("Comandos especiales:")
    print("  /resumen   — Genera resumen ejecutivo automático")
    print("  /top10     — Lista los 10 siniestros más riesgosos")
    print("  /proveedores — Análisis de proveedores")
    print("  /patrones  — Patrones en casos sospechosos")
    print("  /reset     — Resetea el historial")
    print("  /salir     — Termina la sesión")
    print("─" * 60)

    try:
        agente = ClaimsAgent()
    except Exception as e:
        print(f"❌ Error al inicializar el agente: {e}")
        print("Asegúrate de que OPENAI_API_KEY está configurada y los datos procesados existen.")
        return

    print("\n¿Qué deseas analizar?\n")

    while True:
        try:
            pregunta = input("🔍 Tú: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n👋 Sesión terminada.")
            break

        if not pregunta:
            continue

        if pregunta.lower() == "/salir":
            print("👋 Hasta luego. Recuerda: toda alerta requiere revisión humana.")
            break
        elif pregunta.lower() == "/reset":
            agente.resetear_historial()
            continue
        elif pregunta.lower() == "/resumen":
            respuesta = agente.generar_resumen_ejecutivo()
        elif pregunta.lower() == "/top10":
            respuesta = agente.top_siniestros_riesgo(10)
        elif pregunta.lower() == "/proveedores":
            respuesta = agente.analizar_proveedores()
        elif pregunta.lower() == "/patrones":
            respuesta = agente.patrones_sospechosos()
        else:
            respuesta = agente.chat(pregunta)

        print(f"\nVigIA: {respuesta}\n")
        print("─" * 60)


# ─────────────────────────────────────────────
# PUNTO DE ENTRADA
# ─────────────────────────────────────────────

if __name__ == "__main__":
    modo_interactivo()
