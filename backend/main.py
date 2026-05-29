"""
VigIA — Backend FastAPI
Expone los datos del portafolio y el agente IA como API REST.
"""

import io
import os
import sys
import numpy as np
import pandas as pd
from collections import Counter
from datetime import date
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR   = os.path.join(BASE_DIR, "data", "synthetic")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "processed")
sys.path.insert(0, os.path.join(BASE_DIR, "src"))
sys.path.insert(0, BASE_DIR)

app = FastAPI(title="VigIA API", version="1.0.0")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Cache de datos ───────────────────────────────────────────
_df_cache: Optional[pd.DataFrame] = None
_agent_sessions: dict = {}


def get_df() -> pd.DataFrame:
    global _df_cache
    if _df_cache is not None:
        return _df_cache

    ruta_analizado = os.path.join(OUTPUT_DIR, "siniestros_analizados.csv")
    ruta_con_ml    = os.path.join(OUTPUT_DIR, "siniestros_con_ml.csv")
    ruta_raw       = os.path.join(DATA_DIR,   "siniestros.csv")

    if os.path.exists(ruta_analizado):
        df = pd.read_csv(ruta_analizado, encoding="utf-8-sig")
    elif os.path.exists(ruta_raw):
        df = pd.read_csv(ruta_raw, encoding="utf-8-sig")
    else:
        raise FileNotFoundError("No se encontraron datos procesados")

    if os.path.exists(ruta_con_ml):
        df_ml = pd.read_csv(ruta_con_ml, encoding="utf-8-sig")
        if "prob_fraude_ml" not in df.columns:
            df = df.merge(
                df_ml[["id_siniestro", "prob_fraude_ml", "pred_fraude_ml", "nivel_riesgo_ml"]],
                on="id_siniestro", how="left"
            )

    if "semaforo_motor" not in df.columns and "semaforo" in df.columns:
        df["semaforo_motor"] = df["semaforo"]
    if "score_motor" not in df.columns and "score_riesgo" in df.columns:
        df["score_motor"] = df["score_riesgo"]

    _df_cache = df
    return _df_cache


def clean(df: pd.DataFrame) -> list:
    return df.replace({float("nan"): None, np.nan: None}).to_dict(orient="records")


# ─── Health ───────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ─── Estadísticas resumen ─────────────────────────────────────

@app.get("/api/estadisticas")
def get_estadisticas():
    df = get_df()
    sem = "semaforo_motor"
    sc  = "score_motor"

    rojos     = int((df[sem] == "Rojo").sum())    if sem in df.columns else 0
    amarillos = int((df[sem] == "Amarillo").sum()) if sem in df.columns else 0
    verdes    = int((df[sem] == "Verde").sum())   if sem in df.columns else 0

    monto_riesgo = 0.0
    monto_riesgo_amarillo = 0.0
    if sem in df.columns and "monto_reclamado" in df.columns:
        monto_riesgo          = float(df[df[sem] == "Rojo"]["monto_reclamado"].sum())
        monto_riesgo_amarillo = float(df[df[sem] == "Amarillo"]["monto_reclamado"].sum())

    return {
        "total_siniestros":    len(df),
        "rojos":               rojos,
        "amarillos":           amarillos,
        "verdes":              verdes,
        "monto_riesgo_total":  round(monto_riesgo, 2),
        "monto_riesgo_amarillo": round(monto_riesgo_amarillo, 2),
        "score_promedio":      round(float(df[sc].mean()), 1) if sc in df.columns else 0,
        "fraude_confirmado":   int(df["etiqueta_fraude_simulada"].sum()) if "etiqueta_fraude_simulada" in df.columns else 0,
        "alto_riesgo_ml":      int((df["nivel_riesgo_ml"] == "Alto").sum()) if "nivel_riesgo_ml" in df.columns else 0,
    }


# ─── Siniestros (lista filtrable) ─────────────────────────────

@app.get("/api/siniestros")
def get_siniestros(
    semaforo:  Optional[str] = Query(None),
    ramo:      Optional[str] = Query(None),
    sucursal:  Optional[str] = Query(None),
    cobertura: Optional[str] = Query(None),
    score_min: int = Query(0),
    score_max: int = Query(100),
    limit:     int = Query(500),
    offset:    int = Query(0),
):
    df = get_df().copy()

    if semaforo and "semaforo_motor" in df.columns:
        valores = [s.strip() for s in semaforo.split(",")]
        df = df[df["semaforo_motor"].isin(valores)]
    if ramo and ramo not in ("Todos", "") and "ramo" in df.columns:
        df = df[df["ramo"] == ramo]
    if sucursal and sucursal not in ("Todas", "") and "sucursal" in df.columns:
        df = df[df["sucursal"] == sucursal]
    if cobertura and cobertura not in ("Todas", "") and "cobertura" in df.columns:
        df = df[df["cobertura"] == cobertura]
    if "score_motor" in df.columns:
        df = df[(df["score_motor"] >= score_min) & (df["score_motor"] <= score_max)]

    if "score_motor" in df.columns:
        df = df.sort_values("score_motor", ascending=False)

    total = len(df)
    page  = df.iloc[offset: offset + limit]

    return {"total": total, "data": clean(page)}


@app.get("/api/siniestros/{id_siniestro}")
def get_siniestro(id_siniestro: str):
    df   = get_df()
    fila = df[df["id_siniestro"] == id_siniestro]
    if fila.empty:
        raise HTTPException(status_code=404, detail=f"Siniestro {id_siniestro} no encontrado")
    row = fila.iloc[0].replace({float("nan"): None, np.nan: None}).to_dict()
    return row


# ─── Opciones para filtros ─────────────────────────────────────

@app.get("/api/filtros")
def get_filtros():
    df = get_df()
    return {
        "ramos":      sorted(df["ramo"].dropna().unique().tolist())      if "ramo" in df.columns else [],
        "sucursales": sorted(df["sucursal"].dropna().unique().tolist())  if "sucursal" in df.columns else [],
        "coberturas": sorted(df["cobertura"].dropna().unique().tolist()) if "cobertura" in df.columns else [],
    }


# ─── Proveedores ───────────────────────────────────────────────

@app.get("/api/proveedores")
def get_proveedores():
    df      = get_df()
    sem     = "semaforo_motor"
    prv_csv = os.path.join(DATA_DIR, "proveedores.csv")

    if "id_proveedor" not in df.columns:
        return []

    df_rojo = df[df[sem] == "Rojo"] if sem in df.columns else df
    conteo  = df_rojo.groupby("id_proveedor").size().reset_index(name="alertas_rojas")

    if os.path.exists(prv_csv):
        prv  = pd.read_csv(prv_csv, encoding="utf-8-sig")
        cols = [c for c in ["id_proveedor", "nombre_proveedor", "en_lista_restrictiva",
                             "porcentaje_casos_observados"] if c in prv.columns]
        conteo = conteo.merge(prv[cols], on="id_proveedor", how="left")

    conteo = conteo.sort_values("alertas_rojas", ascending=False).head(10)
    return clean(conteo)


# ─── Datos para gráficos ──────────────────────────────────────

@app.get("/api/graficos/semaforo")
def grafico_semaforo(semaforo: Optional[str] = Query(None), ramo: Optional[str] = Query(None)):
    df = get_df().copy()
    if semaforo and "semaforo_motor" in df.columns:
        df = df[df["semaforo_motor"].isin([s.strip() for s in semaforo.split(",")])]
    if ramo and ramo not in ("Todos", "") and "ramo" in df.columns:
        df = df[df["ramo"] == ramo]
    dist = df["semaforo_motor"].value_counts().to_dict() if "semaforo_motor" in df.columns else {}
    return [{"name": k, "value": int(v)} for k, v in dist.items()]


@app.get("/api/graficos/score")
def grafico_score():
    df = get_df()
    if "score_motor" not in df.columns or "semaforo_motor" not in df.columns:
        return []
    result = []
    for sem in ["Rojo", "Amarillo", "Verde"]:
        scores = df[df["semaforo_motor"] == sem]["score_motor"].dropna().tolist()
        result.append({"semaforo": sem, "scores": scores})
    return result


@app.get("/api/graficos/ramo")
def grafico_ramo():
    df = get_df()
    if "ramo" not in df.columns or "semaforo_motor" not in df.columns:
        return []
    datos = df.groupby(["ramo", "semaforo_motor"]).size().reset_index(name="cnt")
    return clean(datos)


@app.get("/api/graficos/ml")
def grafico_ml():
    df = get_df()
    if "prob_fraude_ml" not in df.columns or "score_motor" not in df.columns:
        return []
    cols = [c for c in ["id_siniestro", "score_motor", "prob_fraude_ml",
                         "semaforo_motor", "ramo", "cobertura"] if c in df.columns]
    sub  = df[cols].dropna(subset=["prob_fraude_ml", "score_motor"])
    return clean(sub)


# ─── Analizar siniestro nuevo ─────────────────────────────────

class NuevoSiniestro(BaseModel):
    id_siniestro:                  str   = "SIN-NUEVO"
    ramo:                          str   = "Vehículos"
    cobertura:                     str   = "Colisión"
    monto_reclamado:               float = 15000.0
    suma_asegurada:                float = 20000.0
    dias_desde_inicio_poliza:      int   = 15
    dias_entre_ocurrencia_reporte: int   = 2
    historial_siniestros_asegurado:int   = 1
    siniestros_vehiculo_18m:       int   = 0
    proveedor_lista_restrictiva:   str   = "No"
    documentos_completos:          str   = "Sí"
    documentos_inconsistentes:     str   = "No"
    descripcion:                   str   = ""


@app.post("/api/analizar")
def analizar_siniestro(data: NuevoSiniestro):
    try:
        sys.path.insert(0, os.path.join(BASE_DIR, "src", "rules"))
        from fraud_rules import analizar_siniestro_nuevo  # type: ignore

        payload                          = data.dict()
        payload["en_lista_restrictiva"]  = payload["proveedor_lista_restrictiva"]
        payload["inconsistencias"]       = 1 if payload["documentos_inconsistentes"] == "Sí" else 0

        resultado = analizar_siniestro_nuevo(payload, data_dir=DATA_DIR)
        return {k: (None if isinstance(v, float) and np.isnan(v) else v)
                for k, v in resultado.items()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Chat con el agente ───────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    message:    str


@app.post("/api/chat")
def chat(req: ChatRequest):
    try:
        from ai_agent.claims_agent import ClaimsAgent  # type: ignore

        if req.session_id not in _agent_sessions:
            _agent_sessions[req.session_id] = ClaimsAgent(DATA_DIR, OUTPUT_DIR)

        agente    = _agent_sessions[req.session_id]
        respuesta = agente.chat(req.message)
        return {"response": respuesta, "session_id": req.session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/chat/{session_id}")
def reset_chat(session_id: str):
    if session_id in _agent_sessions:
        _agent_sessions[session_id].resetear_historial()
    return {"ok": True}


# ─── Red de relaciones (grafo) ────────────────────────────────

@app.get("/api/grafo")
def get_grafo(
    semaforo:               Optional[str] = Query("Rojo,Amarillo"),
    solo_lista_restrictiva: bool          = Query(False),
    min_conexiones:         int           = Query(1),
    id_proveedor:           Optional[str] = Query(None),
    limite:                 int           = Query(300),
):
    """
    Construye el grafo de relaciones entre asegurados, proveedores,
    vehículos y siniestros. Útil para detectar clústeres sospechosos.
    Por defecto carga solo los siniestros Rojo y Amarillo (los críticos).
    """
    df = get_df().copy()

    # Filtrar por semáforo
    if semaforo and "semaforo_motor" in df.columns:
        valores = [s.strip() for s in semaforo.split(",")]
        df = df[df["semaforo_motor"].isin(valores)]

    # Ordenar por score descendente y limitar para no saturar el grafo
    if "score_motor" in df.columns:
        df = df.sort_values("score_motor", ascending=False)
    df = df.head(limite)

    # Filtrar por proveedor específico
    if id_proveedor and id_proveedor.strip() and "id_proveedor" in df.columns:
        df = df[df["id_proveedor"] == id_proveedor.strip()]

    # Cargar metadatos de proveedores (nombres + lista restrictiva)
    prv_csv = os.path.join(DATA_DIR, "proveedores.csv")
    prv_nombres: dict = {}
    prv_lista:   dict = {}
    if os.path.exists(prv_csv):
        prv_df = pd.read_csv(prv_csv, encoding="utf-8-sig")
        for _, row in prv_df.iterrows():
            pid = str(row["id_proveedor"])
            prv_nombres[pid] = str(row.get("nombre_proveedor", pid))
            prv_lista[pid]   = str(row.get("en_lista_restrictiva", "No")).strip() == "Sí"

    nodes: dict = {}
    edges: list = []

    # Nodos siniestro
    for _, row in df.iterrows():
        sin_id = str(row.get("id_siniestro", ""))
        if not sin_id or sin_id == "nan":
            continue
        score_val = row.get("score_motor")
        nodes[sin_id] = {
            "id":       sin_id,
            "type":     "siniestro",
            "label":    sin_id,
            "semaforo": str(row.get("semaforo_motor", "Verde")),
            "score":    float(score_val) if pd.notna(score_val) else 0,
        }

    # Nodos asegurado + aristas titular
    if "id_asegurado" in df.columns:
        for _, row in df.iterrows():
            sin_id = str(row.get("id_siniestro", ""))
            ase_id = str(row.get("id_asegurado", ""))
            if not sin_id or sin_id == "nan" or not ase_id or ase_id == "nan":
                continue
            if ase_id not in nodes:
                nodes[ase_id] = {"id": ase_id, "type": "asegurado", "label": ase_id, "semaforo": None}
            edges.append({"source": ase_id, "target": sin_id, "label": "titular"})

    # Nodos proveedor + aristas atendió
    if "id_proveedor" in df.columns:
        for _, row in df.iterrows():
            sin_id = str(row.get("id_siniestro", ""))
            prv_id = str(row.get("id_proveedor", ""))
            if not sin_id or sin_id == "nan" or not prv_id or prv_id == "nan":
                continue
            en_lista = prv_lista.get(prv_id, False)
            if solo_lista_restrictiva and not en_lista:
                continue
            if prv_id not in nodes:
                nodes[prv_id] = {
                    "id":                  prv_id,
                    "type":                "proveedor",
                    "label":               prv_nombres.get(prv_id, prv_id),
                    "en_lista_restrictiva": en_lista,
                    "semaforo":            None,
                }
            edges.append({"source": prv_id, "target": sin_id, "label": "atendió"})

    # Nodos vehículo + aristas involucrado (solo si la columna existe)
    if "id_vehiculo" in df.columns:
        for _, row in df.iterrows():
            sin_id = str(row.get("id_siniestro", ""))
            veh_id = str(row.get("id_vehiculo", ""))
            if not sin_id or sin_id == "nan" or not veh_id or veh_id == "nan":
                continue
            if veh_id not in nodes:
                nodes[veh_id] = {"id": veh_id, "type": "vehiculo", "label": veh_id, "semaforo": None}
            edges.append({"source": veh_id, "target": sin_id, "label": "involucrado"})

    # Aplicar filtro de mínimo de conexiones para revelar clústeres densos
    if min_conexiones > 1:
        conteo: Counter = Counter()
        for e in edges:
            conteo[e["source"]] += 1
            conteo[e["target"]] += 1
        nodes = {k: v for k, v in nodes.items() if conteo.get(k, 0) >= min_conexiones}
        edges = [e for e in edges if e["source"] in nodes and e["target"] in nodes]

    # Insight automático: proveedor más conectado en la selección actual
    insights: dict = {}
    if "id_proveedor" in df.columns and not df.empty:
        prv_conteo = df.groupby("id_proveedor").size()
        if not prv_conteo.empty:
            top_pid  = str(prv_conteo.idxmax())
            top_n    = int(prv_conteo.max())
            top_name = prv_nombres.get(top_pid, top_pid)
            aseg_distintos = 0
            if "id_asegurado" in df.columns:
                aseg_distintos = int(df[df["id_proveedor"] == top_pid]["id_asegurado"].nunique())
            insights["top_proveedor"] = (
                f"El proveedor {top_name} está conectado a {top_n} siniestro(s) de riesgo, "
                f"compartiendo {aseg_distintos} asegurado(s) distinto(s)."
            )

    return {
        "nodes":         list(nodes.values()),
        "edges":         edges,
        "insights":      insights,
        "total_nodos":   len(nodes),
        "total_aristas": len(edges),
    }


# ─── Reporte de auditoría CSV ─────────────────────────────────

@app.get("/api/reporte/csv")
def get_reporte_csv():
    """
    Genera y descarga un CSV de auditoría con todos los siniestros Rojo y Amarillo,
    con las columnas clave para revisión del analista, ordenados por score descendente.
    """
    df = get_df().copy()

    if "semaforo_motor" in df.columns:
        df = df[df["semaforo_motor"].isin(["Rojo", "Amarillo"])]
    if "score_motor" in df.columns:
        df = df.sort_values("score_motor", ascending=False)

    # Columnas en el orden solicitado para el reporte de auditoría
    columnas_reporte = [
        "id_siniestro", "semaforo_motor", "score_motor", "ramo", "cobertura",
        "fecha_ocurrencia", "monto_reclamado", "suma_asegurada",
        "id_asegurado", "id_proveedor", "nombre_proveedor",
        "reglas_criticas_activadas", "num_señales_motor", "señales_motor",
        "explicacion_alerta", "estado", "sucursal",
    ]
    cols_presentes = [c for c in columnas_reporte if c in df.columns]
    df_reporte = df[cols_presentes]

    filename = f"reporte_auditoria_{date.today().isoformat()}.csv"
    output   = io.StringIO()
    df_reporte.to_csv(output, index=False, encoding="utf-8")

    return StreamingResponse(
        iter([output.getvalue().encode("utf-8")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Señales: mapeo código → texto legible ──────────────────────

SENALES_TEXTO: dict = {
    "S01": "Borde de vigencia crítico (≤10 días inicio póliza)",
    "S02": "Borde de vigencia (11-30 días inicio póliza)",
    "S03": "Demora en denuncia de robo (>48 hrs)",
    "S04": "Demora en denuncia de robo (24-48 hrs)",
    "S05": "Alta frecuencia reclamos asegurado (≥3)",
    "S06": "Frecuencia reclamos asegurado (2 eventos)",
    "S07": "Alta frecuencia conductor en vehículo (≥3)",
    "S09": "Alta frecuencia reclamos vehículo (≥3)",
    "S11": "Proveedor en lista restrictiva",
    "S13": "Documentos incompletos o no entregados",
    "S14": "Dinámica de accidente sospechosa",
    "S16": "Documentos inconsistentes / adulterados",
    "S17": "Reporte tardío del siniestro (>7 días)",
    "S19": "Narrativa similar a otro reclamo (>85%)",
    "S21": "Monto cercano o superior a suma asegurada",
}
SENALES_CRITICAS = {"S01", "S11", "S16", "S03"}


# ─── Red de relaciones: vistas analíticas ───────────────────────

@app.get("/api/relaciones/ranking-proveedores")
def get_relaciones_ranking():
    """Calcula ranking de riesgo de proveedores y asegurados para la vista analítica."""
    df  = get_df().copy()
    sem = "semaforo_motor"

    # Columnas auxiliares para sumas eficientes sin lambdas
    df["_rojo"]     = (df[sem] == "Rojo").astype(int)
    df["_amarillo"] = (df[sem] == "Amarillo").astype(int)

    total_rojos = int(df["_rojo"].sum())

    # Insight: top 3 proveedores concentran X% de los Rojo
    if "id_proveedor" in df.columns:
        prv_rojos  = df.groupby("id_proveedor")["_rojo"].sum().sort_values(ascending=False)
        top3_count = int(prv_rojos.head(3).sum())
        top3_pct   = round(top3_count / total_rojos * 100, 1) if total_rojos > 0 else 0.0
    else:
        top3_count, top3_pct = 0, 0.0
        prv_rojos = pd.Series(dtype=int)

    # Asegurado con más siniestros Rojo
    if "id_asegurado" in df.columns:
        ase_rojos = df.groupby("id_asegurado")["_rojo"].sum().sort_values(ascending=False)
        top_ase   = str(ase_rojos.index[0]) if not ase_rojos.empty else "—"
        top_ase_n = int(ase_rojos.iloc[0])  if not ase_rojos.empty else 0
    else:
        top_ase, top_ase_n = "—", 0
        ase_rojos = pd.Series(dtype=int)

    # Tarjeta 1: proveedores con ≥3 casos Rojo
    prvs_en_alerta = int((prv_rojos >= 3).sum()) if not prv_rojos.empty else 0

    # Tarjeta 2: asegurados con ≥2 casos Rojo
    aseg_recurrentes = int((ase_rojos >= 2).sum()) if not ase_rojos.empty else 0

    # Tarjeta 3: clústeres = prv en lista restrictiva + prv con >50% casos Rojo
    if "id_proveedor" in df.columns and "en_lista_restrictiva" in df.columns:
        prv_stats = df.groupby("id_proveedor").agg(
            total_c=("id_siniestro", "count"),
            rojos_c=("_rojo", "sum"),
            en_lista=("en_lista_restrictiva", "first"),
        )
        clusteres = int(
            ((prv_stats["en_lista"].str.strip() == "Sí") |
             (prv_stats["rojos_c"] / prv_stats["total_c"].clip(lower=1) > 0.5)).sum()
        )
    else:
        clusteres = 0

    # Tabla de proveedores (top 10 por casos Rojo)
    if "id_proveedor" in df.columns:
        agg_cols: dict = {
            "casos_rojo":    ("_rojo",    "sum"),
            "casos_amarillo":("_amarillo","sum"),
            "total_casos":   ("id_siniestro", "count"),
        }
        if "nombre_proveedor"     in df.columns: agg_cols["nombre"]   = ("nombre_proveedor", "first")
        if "tipo"                 in df.columns: agg_cols["tipo"]     = ("tipo", "first")
        if "en_lista_restrictiva" in df.columns: agg_cols["en_lista"] = ("en_lista_restrictiva", "first")

        prv_tabla = df.groupby("id_proveedor").agg(**agg_cols).reset_index()
        prv_tabla["pct_concentracion"] = (
            prv_tabla["casos_rojo"] / prv_tabla["total_casos"].clip(lower=1) * 100
        ).round(1)
        prv_tabla["casos_rojo"]     = prv_tabla["casos_rojo"].astype(int)
        prv_tabla["casos_amarillo"] = prv_tabla["casos_amarillo"].astype(int)
        prv_tabla = prv_tabla.sort_values("casos_rojo", ascending=False).head(10)
        tabla_proveedores = clean(prv_tabla)
    else:
        tabla_proveedores = []

    # Tabla de asegurados (top 10 por siniestros críticos Rojo+Amarillo)
    if "id_asegurado" in df.columns:
        df_crit = df[df[sem].isin(["Rojo", "Amarillo"])]
        ase_agg: dict = {
            "siniestros_criticos": ("id_siniestro", "count"),
            "score_maximo":        ("score_motor", "max"),
        }
        if "id_proveedor" in df.columns:
            ase_agg["proveedores_distintos"] = ("id_proveedor", "nunique")

        ase_tabla = df_crit.groupby("id_asegurado").agg(**ase_agg).reset_index()

        # Semáforo predominante: el más frecuente entre los casos críticos
        sem_mode = (
            df_crit.groupby(["id_asegurado", sem])
            .size()
            .reset_index(name="_n")
            .sort_values("_n", ascending=False)
            .drop_duplicates(subset="id_asegurado")
            .set_index("id_asegurado")[sem]
            .rename("semaforo_predominante")
        )
        ase_tabla = ase_tabla.join(sem_mode, on="id_asegurado", how="left")
        ase_tabla = ase_tabla.sort_values("siniestros_criticos", ascending=False).head(10)
        tabla_asegurados = clean(ase_tabla)
    else:
        tabla_asegurados = []

    return {
        "insight": {
            "top3_pct":        top3_pct,
            "top3_count":      top3_count,
            "total_rojos":     total_rojos,
            "asegurado_top":   top_ase,
            "asegurado_top_n": top_ase_n,
        },
        "metricas": {
            "proveedores_en_alerta":  prvs_en_alerta,
            "asegurados_recurrentes": aseg_recurrentes,
            "clusteres_detectados":   clusteres,
        },
        "tabla_proveedores": tabla_proveedores,
        "tabla_asegurados":  tabla_asegurados,
    }


@app.get("/api/relaciones/selector-proveedores")
def get_selector_proveedores():
    """Lista de proveedores con al menos 1 caso crítico, ordenados por casos Rojo DESC."""
    df  = get_df()
    sem = "semaforo_motor"
    if "id_proveedor" not in df.columns:
        return []

    df_crit = df[df[sem].isin(["Rojo", "Amarillo"])] if sem in df.columns else df
    prv = df_crit.groupby("id_proveedor").agg(
        casos_rojo=(sem, lambda x: int((x == "Rojo").sum())),
    ).reset_index()
    if "nombre_proveedor" in df.columns:
        nombres = df.groupby("id_proveedor")["nombre_proveedor"].first().rename("nombre")
        prv = prv.join(nombres, on="id_proveedor", how="left")

    prv = prv.sort_values("casos_rojo", ascending=False)
    return clean(prv)


@app.get("/api/relaciones/detalle-proveedor")
def get_detalle_proveedor(id: str = Query(...)):
    """Detalle completo de un proveedor: distribución, métricas, señales y siniestros."""
    df     = get_df()
    sem    = "semaforo_motor"
    df_prv = df[df["id_proveedor"] == id].copy() if "id_proveedor" in df.columns else pd.DataFrame()
    if df_prv.empty:
        raise HTTPException(status_code=404, detail=f"Proveedor {id} no encontrado")

    total      = len(df_prv)
    n_rojo     = int((df_prv[sem] == "Rojo").sum())     if sem in df_prv.columns else 0
    n_amarillo = int((df_prv[sem] == "Amarillo").sum()) if sem in df_prv.columns else 0
    n_verde    = int((df_prv[sem] == "Verde").sum())    if sem in df_prv.columns else 0

    # Señales más frecuentes: explotar pipe-separated, contar por código
    sen_col = next(
        (c for c in df_prv.columns if "eales_motor" in c and "num" not in c), None
    )
    senales_planas: list = []
    if sen_col:
        for val in df_prv[sen_col].dropna():
            for parte in str(val).split("|"):
                codigo = parte.strip().split(":")[0].strip()
                if codigo and codigo != "nan":
                    senales_planas.append(codigo)

    top_senales = [
        {
            "codigo":      code,
            "texto":       SENALES_TEXTO.get(code, code),
            "frecuencia":  freq,
            "total_casos": total,
            "es_critica":  code in SENALES_CRITICAS,
        }
        for code, freq in Counter(senales_planas).most_common(5)
    ]

    # Reglas críticas RF más frecuentes
    rf_planas: list = []
    if "reglas_criticas_activadas" in df_prv.columns:
        for val in df_prv["reglas_criticas_activadas"].dropna():
            for parte in str(val).split(","):
                r = parte.strip()
                if r and r != "nan":
                    rf_planas.append(r)
    top_reglas = [
        {"codigo": c, "frecuencia": f, "total_casos": total}
        for c, f in Counter(rf_planas).most_common()
    ]

    # Métricas económicas
    monto_total = float(df_prv["monto_reclamado"].sum())  if "monto_reclamado" in df_prv.columns else 0.0
    promedio    = float(df_prv["monto_reclamado"].mean()) if "monto_reclamado" in df_prv.columns else 0.0
    aseg_dist   = int(df_prv["id_asegurado"].nunique())   if "id_asegurado" in df_prv.columns else 0
    pct_docs    = 0.0
    if "documentos_inconsistentes" in df_prv.columns:
        pct_docs = round(
            (df_prv["documentos_inconsistentes"].str.strip() == "Sí").sum() / total * 100, 1
        )

    # Siniestros del proveedor (ordenados por score)
    cols_sin = [c for c in ["id_siniestro", "id_asegurado", "cobertura",
                             "monto_reclamado", "score_motor", sem] if c in df_prv.columns]
    siniestros = clean(df_prv[cols_sin].sort_values("score_motor", ascending=False))

    first = df_prv.iloc[0]
    return {
        "proveedor": {
            "id":                   id,
            "nombre":               str(first.get("nombre_proveedor", id)),
            "en_lista_restrictiva": str(first.get("en_lista_restrictiva", "No")).strip() == "Sí",
            "tipo":                 str(first.get("tipo", "—")),
        },
        "distribucion": {"rojo": n_rojo, "amarillo": n_amarillo, "verde": n_verde, "total": total},
        "metricas": {
            "monto_total":             round(monto_total, 2),
            "promedio_por_caso":       round(promedio, 2),
            "asegurados_distintos":    aseg_dist,
            "pct_docs_inconsistentes": pct_docs,
        },
        "senales_frecuentes": top_senales,
        "reglas_criticas":    top_reglas,
        "siniestros":         siniestros,
    }


@app.get("/api/relaciones/grafo-cluster")
def get_grafo_cluster(id: str = Query(...)):
    """Construye el grafo de clúster centrado en un proveedor (máx 30 siniestros)."""
    df     = get_df()
    sem    = "semaforo_motor"
    df_prv = df[df["id_proveedor"] == id].copy() if "id_proveedor" in df.columns else pd.DataFrame()
    if df_prv.empty:
        raise HTTPException(status_code=404, detail=f"Proveedor {id} no encontrado")

    # Limitar a top 25 siniestros por score para no saturar el canvas
    if "score_motor" in df_prv.columns:
        df_prv = df_prv.sort_values("score_motor", ascending=False)
    df_prv = df_prv.head(25)

    nombre_prv = str(df_prv.iloc[0].get("nombre_proveedor", id))
    en_lista   = str(df_prv.iloc[0].get("en_lista_restrictiva", "No")).strip() == "Sí"

    nodes: dict = {}
    edges: list = []

    # Nodo central del proveedor (más grande)
    nodes[id] = {
        "id": id, "type": "proveedor", "label": nombre_prv,
        "semaforo": None, "score": None, "en_lista_restrictiva": en_lista,
    }

    for _, row in df_prv.iterrows():
        sin_id  = str(row.get("id_siniestro", ""))
        ase_id  = str(row.get("id_asegurado", "")) if "id_asegurado" in df_prv.columns else ""
        sem_val = str(row.get(sem, "Verde"))
        score_v = row.get("score_motor")
        score_n = float(score_v) if pd.notna(score_v) else 0.0

        if sin_id and sin_id != "nan":
            nodes[sin_id] = {
                "id": sin_id, "type": "siniestro", "label": sin_id,
                "semaforo": sem_val, "score": score_n, "en_lista_restrictiva": False,
            }
            edges.append({"source": id, "target": sin_id, "label": "atendió"})

        if ase_id and ase_id != "nan":
            if ase_id not in nodes:
                nodes[ase_id] = {
                    "id": ase_id, "type": "asegurado", "label": ase_id,
                    "semaforo": None, "score": None, "en_lista_restrictiva": False,
                }
            if sin_id and sin_id != "nan":
                edges.append({"source": ase_id, "target": sin_id, "label": "titular"})

    return {
        "nodes":            list(nodes.values()),
        "edges":            edges,
        "total_nodos":      len(nodes),
        "total_aristas":    len(edges),
        "nombre_proveedor": nombre_prv,
    }
