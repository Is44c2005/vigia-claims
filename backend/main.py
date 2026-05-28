"""
VigIA — Backend FastAPI
Expone los datos del portafolio y el agente IA como API REST.
"""

import os
import sys
import numpy as np
import pandas as pd
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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
    if sem in df.columns and "monto_reclamado" in df.columns:
        monto_riesgo = float(df[df[sem] == "Rojo"]["monto_reclamado"].sum())

    return {
        "total_siniestros": len(df),
        "rojos":            rojos,
        "amarillos":        amarillos,
        "verdes":           verdes,
        "monto_riesgo_total": round(monto_riesgo, 2),
        "score_promedio":   round(float(df[sc].mean()), 1) if sc in df.columns else 0,
        "fraude_confirmado": int(df["etiqueta_fraude_simulada"].sum()) if "etiqueta_fraude_simulada" in df.columns else 0,
        "alto_riesgo_ml":   int((df["nivel_riesgo_ml"] == "Alto").sum()) if "nivel_riesgo_ml" in df.columns else 0,
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
