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
