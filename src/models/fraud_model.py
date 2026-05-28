"""
=============================================================
hackIAthon 2026 — Reto Aseguradora del Sur
Modelo ML Supervisado — fraud_model.py
=============================================================
Responsabilidades:
  1. Construir features enriquecidas cruzando las 6 tablas
  2. Entrenar Random Forest y XGBoost
  3. Comparar modelos y seleccionar el mejor
  4. Exportar probabilidad de fraude por siniestro
  5. Guardar modelo en .pkl
  6. Generar reporte de métricas completo
=============================================================
"""

import os
import sys
import json
import warnings
import joblib
import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    classification_report, confusion_matrix,
    roc_auc_score, precision_recall_curve, average_precision_score,
    f1_score, precision_score, recall_score
)

try:
    from xgboost import XGBClassifier
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    print("⚠️  XGBoost no disponible — se usará solo Random Forest")

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────
# RUTAS
# ─────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR   = os.path.join(BASE_DIR, "data", "synthetic")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "processed")
MODEL_DIR  = os.path.join(BASE_DIR, "data", "processed")
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)

# ─────────────────────────────────────────────
# 1. CONSTRUCCIÓN DE FEATURES
# ─────────────────────────────────────────────

def cargar_y_construir_features(data_dir: str = DATA_DIR) -> pd.DataFrame:
    """
    Carga los 6 CSVs y construye un DataFrame con todas las features
    para el modelo ML supervisado.
    """
    print("📂 Cargando datasets...")
    sin = pd.read_csv(os.path.join(data_dir, "siniestros.csv"),    encoding="utf-8-sig")
    ase = pd.read_csv(os.path.join(data_dir, "asegurados.csv"),    encoding="utf-8-sig")
    pol = pd.read_csv(os.path.join(data_dir, "polizas.csv"),       encoding="utf-8-sig")
    prv = pd.read_csv(os.path.join(data_dir, "proveedores.csv"),   encoding="utf-8-sig")
    veh = pd.read_csv(os.path.join(data_dir, "vehiculos.csv"),     encoding="utf-8-sig")
    doc = pd.read_csv(os.path.join(data_dir, "documentos.csv"),    encoding="utf-8-sig")

    print(f"  Siniestros:   {len(sin):,}")
    print(f"  Asegurados:   {len(ase):,}")
    print(f"  Pólizas:      {len(pol):,}")
    print(f"  Proveedores:  {len(prv):,}")
    print(f"  Vehículos:    {len(veh):,}")
    print(f"  Documentos:   {len(doc):,}")

    # ── Agregar documentos por siniestro ─────────────────────────
    doc_agg = doc.groupby("id_siniestro").agg(
        total_documentos     = ("id_documento", "count"),
        docs_entregados      = ("entregado",    lambda x: (x == "Sí").sum()),
        docs_legibles        = ("legible",       lambda x: (x == "Sí").sum()),
        inconsistencias_doc  = ("inconsistencia_detectada", lambda x: (x == "Sí").sum()),
    ).reset_index()
    doc_agg["pct_entregados"]   = doc_agg["docs_entregados"] / doc_agg["total_documentos"].clip(lower=1)
    doc_agg["pct_legibles"]     = doc_agg["docs_legibles"]   / doc_agg["total_documentos"].clip(lower=1)
    doc_agg["pct_inconsistent"] = doc_agg["inconsistencias_doc"] / doc_agg["total_documentos"].clip(lower=1)

    # ── Merge tablas ──────────────────────────────────────────────
    df = sin.merge(ase[["id_asegurado", "segmento", "antiguedad_cliente_años",
                          "reclamos_ultimos_12m", "mora_actual",
                          "score_cliente_simulado", "es_perfil_riesgo"
                         ]], on="id_asegurado", how="left")

    df = df.merge(prv[["id_proveedor", "porcentaje_casos_observados",
                         "monto_promedio_reclamado", "en_lista_restrictiva",
                         "antiguedad_años"
                        ]], on="id_proveedor", how="left")

    df = df.merge(veh[["id_vehiculo", "anio", "siniestros_periodo_18m"
                        ]], on="id_vehiculo", how="left")

    df = df.merge(pol[["id_poliza", "prima", "deducible_pct"
                        ]], on="id_poliza", how="left")

    df = df.merge(doc_agg, on="id_siniestro", how="left")

    print(f"\n✅ Dataset enriquecido: {len(df)} filas, {len(df.columns)} columnas")
    return df


def construir_features(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """
    Selecciona y transforma las features para el modelo.
    Retorna (X, y).
    """
    # ── Features numéricas directas ───────────────────────────────
    num_features = [
        "score_riesgo",
        "num_señales",
        "dias_desde_inicio_poliza",
        "dias_entre_ocurrencia_reporte",
        "dias_desde_fin_poliza",
        "siniestros_vehiculo_18m",
        "historial_siniestros_asegurado",
        "monto_reclamado",
        "monto_estimado",
        "suma_asegurada_poliza",
        # Del asegurado
        "score_cliente_simulado",
        "reclamos_ultimos_12m",
        "antiguedad_cliente_años",
        # Del proveedor
        "porcentaje_casos_observados",
        "monto_promedio_reclamado",
        # Del vehículo
        "siniestros_periodo_18m",
        "anio",
        # De la póliza
        "prima",
        "deducible_pct",
        # De documentos agregados
        "total_documentos",
        "inconsistencias_doc",
        "pct_entregados",
        "pct_legibles",
        "pct_inconsistent",
    ]

    # ── Features derivadas ────────────────────────────────────────
    df = df.copy()

    # Ratio monto reclamado vs suma asegurada (señal S21)
    df["ratio_monto_suma"] = (
        df["monto_reclamado"] / df["suma_asegurada_poliza"].replace(0, np.nan)
    ).fillna(0).clip(0, 2)

    # Ratio monto reclamado vs monto estimado
    df["ratio_reclamado_estimado"] = (
        df["monto_reclamado"] / df["monto_estimado"].replace(0, np.nan)
    ).fillna(1).clip(0, 5)

    # Días al borde de vigencia (normalizado)
    df["borde_vigencia_critico"] = (df["dias_desde_inicio_poliza"] <= 10).astype(int)
    df["borde_vigencia_medio"]   = (
        (df["dias_desde_inicio_poliza"] > 10) &
        (df["dias_desde_inicio_poliza"] <= 30)
    ).astype(int)

    derived_features = [
        "ratio_monto_suma",
        "ratio_reclamado_estimado",
        "borde_vigencia_critico",
        "borde_vigencia_medio",
    ]

    # ── Features categóricas (label encoding) ─────────────────────
    cat_features_raw = {
        "proveedor_lista_restrictiva": "proveedor_lista_restrictiva_enc",
        "documentos_inconsistentes":   "docs_inconsistentes_enc",
        "documentos_completos":        "docs_completos_enc",
        "mora_actual":                 "mora_enc",
        "es_perfil_riesgo":            "perfil_riesgo_enc",
    }
    cat_features = []
    for src, dst in cat_features_raw.items():
        if src in df.columns:
            df[dst] = (df[src].fillna("No").str.strip() == "Sí").astype(int)
            cat_features.append(dst)

    # Ramo encoding (top categorías)
    if "ramo" in df.columns:
        df["ramo_enc"] = LabelEncoder().fit_transform(df["ramo"].fillna("Otro").astype(str))
        cat_features.append("ramo_enc")

    # Cobertura encoding
    if "cobertura" in df.columns:
        df["cobertura_enc"] = LabelEncoder().fit_transform(df["cobertura"].fillna("Otra").astype(str))
        cat_features.append("cobertura_enc")

    # ── Consolidar todas las features ─────────────────────────────
    all_features = num_features + derived_features + cat_features
    available    = [f for f in all_features if f in df.columns]

    X = df[available].fillna(0)
    y = df["etiqueta_fraude_simulada"].fillna(0).astype(int)

    print(f"\n🔧 Features construidas: {len(available)}")
    print(f"   Fraude=1: {y.sum():,} ({y.mean()*100:.1f}%)")
    print(f"   Fraude=0: {(1-y).sum():,} ({(1-y.mean())*100:.1f}%)")

    return X, y, available


# ─────────────────────────────────────────────
# 2. ENTRENAMIENTO Y EVALUACIÓN
# ─────────────────────────────────────────────

def entrenar_y_evaluar(
    X: pd.DataFrame,
    y: pd.Series,
    feature_names: list,
    output_dir: str = OUTPUT_DIR
) -> dict:
    """
    Entrena Random Forest y XGBoost, compara métricas,
    guarda el mejor modelo en .pkl.
    """
    print("\n" + "="*60)
    print("🤖 ENTRENAMIENTO DE MODELOS")
    print("="*60)

    # Split estratificado
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"\n  Train: {len(X_train):,} | Test: {len(X_test):,}")
    print(f"  Fraude en train: {y_train.sum()} ({y_train.mean()*100:.1f}%)")
    print(f"  Fraude en test:  {y_test.sum()} ({y_test.mean()*100:.1f}%)")

    resultados = {}

    # ── Random Forest ─────────────────────────────────────────────
    print("\n📊 Entrenando Random Forest...")
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_split=10,
        min_samples_leaf=5,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )
    rf.fit(X_train, y_train)
    rf_proba = rf.predict_proba(X_test)[:, 1]
    rf_pred  = (rf_proba >= 0.5).astype(int)

    rf_metrics = calcular_metricas("Random Forest", y_test, rf_pred, rf_proba)
    resultados["random_forest"] = {
        "model":   rf,
        "metrics": rf_metrics,
        "proba":   rf_proba,
        "name":    "Random Forest"
    }

    # ── XGBoost ───────────────────────────────────────────────────
    if XGBOOST_AVAILABLE:
        print("\n📊 Entrenando XGBoost...")
        scale_pos = (y_train == 0).sum() / (y_train == 1).sum()
        xgb = XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=scale_pos,
            random_state=42,
            eval_metric="logloss",
            verbosity=0,
            use_label_encoder=False
        )
        xgb.fit(X_train, y_train)
        xgb_proba = xgb.predict_proba(X_test)[:, 1]
        xgb_pred  = (xgb_proba >= 0.5).astype(int)

        xgb_metrics = calcular_metricas("XGBoost", y_test, xgb_pred, xgb_proba)
        resultados["xgboost"] = {
            "model":   xgb,
            "metrics": xgb_metrics,
            "proba":   xgb_proba,
            "name":    "XGBoost"
        }

    # ── Seleccionar mejor modelo ───────────────────────────────────
    mejor_key = max(
        resultados,
        key=lambda k: resultados[k]["metrics"]["auc_roc"]
    )
    mejor = resultados[mejor_key]
    print(f"\n🏆 MEJOR MODELO: {mejor['name']} (AUC-ROC: {mejor['metrics']['auc_roc']:.4f})")

    # ── Importancia de features ────────────────────────────────────
    modelo = mejor["model"]
    if hasattr(modelo, "feature_importances_"):
        importancias = pd.DataFrame({
            "feature":    feature_names,
            "importance": modelo.feature_importances_
        }).sort_values("importance", ascending=False)
        print("\n📌 TOP 10 FEATURES MÁS IMPORTANTES:")
        for _, row in importancias.head(10).iterrows():
            bar = "█" * int(row["importance"] * 100)
            print(f"   {row['feature']:<35} {row['importance']:.4f}  {bar}")
        ruta_imp = os.path.join(output_dir, "feature_importances.csv")
        importancias.to_csv(ruta_imp, index=False)

    # ── Guardar modelo ─────────────────────────────────────────────
    modelo_path = os.path.join(output_dir, "best_fraud_model.pkl")
    joblib.dump({
        "model":         modelo,
        "model_name":    mejor["name"],
        "feature_names": feature_names,
        "metrics":       mejor["metrics"],
        "threshold":     0.5
    }, modelo_path)
    print(f"\n💾 Modelo guardado: {modelo_path}")

    # Guardar también metadata JSON
    meta = {
        "model_name":    mejor["name"],
        "feature_names": feature_names,
        "metrics":       {k: float(v) for k, v in mejor["metrics"].items()
                          if isinstance(v, (int, float, np.floating))},
        "comparacion": {
            k: {m: float(v) for m, v in r["metrics"].items()
                if isinstance(v, (int, float, np.floating))}
            for k, r in resultados.items()
        }
    }
    with open(os.path.join(output_dir, "model_metadata.json"), "w") as f:
        json.dump(meta, f, indent=2)

    return resultados, mejor_key, X_test, y_test


def calcular_metricas(nombre: str, y_true, y_pred, y_proba) -> dict:
    """Calcula y muestra todas las métricas requeridas."""
    auc  = roc_auc_score(y_true, y_proba)
    f1   = f1_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec  = recall_score(y_true, y_pred, zero_division=0)
    avg_prec = average_precision_score(y_true, y_proba)
    cm   = confusion_matrix(y_true, y_pred)

    print(f"\n  ── {nombre} ──")
    print(f"     AUC-ROC:   {auc:.4f}")
    print(f"     F1-Score:  {f1:.4f}")
    print(f"     Precision: {prec:.4f}")
    print(f"     Recall:    {rec:.4f}")
    print(f"     Avg. Prec: {avg_prec:.4f}")
    print(f"     Matriz de confusión:")
    print(f"       TN={cm[0,0]:4d}  FP={cm[0,1]:4d}")
    print(f"       FN={cm[1,0]:4d}  TP={cm[1,1]:4d}")
    print(f"\n  {classification_report(y_true, y_pred, target_names=['Legítimo','Fraude'])}")

    return {
        "auc_roc":        auc,
        "f1_score":       f1,
        "precision":      prec,
        "recall":         rec,
        "avg_precision":  avg_prec,
        "tn": int(cm[0,0]), "fp": int(cm[0,1]),
        "fn": int(cm[1,0]), "tp": int(cm[1,1]),
    }


# ─────────────────────────────────────────────
# 3. GENERAR PREDICCIONES SOBRE TODO EL DATASET
# ─────────────────────────────────────────────

def generar_predicciones_completas(
    df_enriquecido: pd.DataFrame,
    feature_names: list,
    output_dir: str = OUTPUT_DIR
) -> pd.DataFrame:
    """
    Carga el mejor modelo guardado y genera predicciones
    sobre el dataset completo. Exporta siniestros_con_ml.csv.
    """
    modelo_path = os.path.join(output_dir, "best_fraud_model.pkl")
    if not os.path.exists(modelo_path):
        raise FileNotFoundError(f"Modelo no encontrado: {modelo_path}")

    bundle  = joblib.load(modelo_path)
    modelo  = bundle["model"]
    feats   = bundle["feature_names"]

    # Reconstruir features
    df = df_enriquecido.copy()
    df["ratio_monto_suma"] = (
        df["monto_reclamado"] / df["suma_asegurada_poliza"].replace(0, np.nan)
    ).fillna(0).clip(0, 2)
    df["ratio_reclamado_estimado"] = (
        df["monto_reclamado"] / df["monto_estimado"].replace(0, np.nan)
    ).fillna(1).clip(0, 5)
    df["borde_vigencia_critico"] = (df["dias_desde_inicio_poliza"] <= 10).astype(int)
    df["borde_vigencia_medio"]   = (
        (df["dias_desde_inicio_poliza"] > 10) &
        (df["dias_desde_inicio_poliza"] <= 30)
    ).astype(int)

    cat_map = {
        "proveedor_lista_restrictiva": "proveedor_lista_restrictiva_enc",
        "documentos_inconsistentes":   "docs_inconsistentes_enc",
        "documentos_completos":        "docs_completos_enc",
        "mora_actual":                 "mora_enc",
        "es_perfil_riesgo":            "perfil_riesgo_enc",
    }
    for src, dst in cat_map.items():
        if src in df.columns:
            df[dst] = (df[src].fillna("No").str.strip() == "Sí").astype(int)

    for col_cat in ["ramo", "cobertura"]:
        enc_col = col_cat + "_enc"
        if col_cat in df.columns:
            df[enc_col] = LabelEncoder().fit_transform(df[col_cat].fillna("Otro").astype(str))

    X_full = df[[f for f in feats if f in df.columns]].fillna(0)

    df["prob_fraude_ml"] = modelo.predict_proba(X_full)[:, 1]
    df["pred_fraude_ml"] = (df["prob_fraude_ml"] >= 0.5).astype(int)
    df["nivel_riesgo_ml"] = pd.cut(
        df["prob_fraude_ml"],
        bins=[0, 0.3, 0.6, 1.0],
        labels=["Bajo", "Medio", "Alto"]
    )

    # Exportar
    cols_salida = [
        "id_siniestro", "id_poliza", "id_asegurado", "ramo", "cobertura",
        "monto_reclamado", "score_riesgo", "semaforo",
        "prob_fraude_ml", "pred_fraude_ml", "nivel_riesgo_ml",
        "etiqueta_fraude_simulada"
    ]
    cols_pres = [c for c in cols_salida if c in df.columns]
    ruta = os.path.join(output_dir, "siniestros_con_ml.csv")
    df[cols_pres].to_csv(ruta, index=False, encoding="utf-8-sig")
    print(f"\n📤 Predicciones exportadas: {ruta}")
    print(f"   Alto riesgo ML: {(df['nivel_riesgo_ml']=='Alto').sum()}")
    print(f"   Medio riesgo ML: {(df['nivel_riesgo_ml']=='Medio').sum()}")
    print(f"   Bajo riesgo ML: {(df['nivel_riesgo_ml']=='Bajo').sum()}")

    return df


# ─────────────────────────────────────────────
# 4. FUNCIÓN DE PREDICCIÓN EN TIEMPO REAL
# ─────────────────────────────────────────────

def predecir_siniestro(siniestro_features: dict, output_dir: str = OUTPUT_DIR) -> dict:
    """
    Predice la probabilidad de fraude para un siniestro nuevo.
    Compatible con analizar_siniestro_nuevo() del motor de reglas.

    Parámetros:
        siniestro_features: dict con los campos del siniestro
    Retorna:
        dict con prob_fraude, pred_fraude, nivel_riesgo
    """
    modelo_path = os.path.join(output_dir, "best_fraud_model.pkl")
    bundle  = joblib.load(modelo_path)
    modelo  = bundle["model"]
    feats   = bundle["feature_names"]

    row = {}
    for f in feats:
        row[f] = siniestro_features.get(f, 0)

    # Calcular derivadas si se dan los campos base
    monto   = float(siniestro_features.get("monto_reclamado", 0))
    suma_as = float(siniestro_features.get("suma_asegurada_poliza", 1) or 1)
    monto_e = float(siniestro_features.get("monto_estimado", 1) or 1)
    dias_in = float(siniestro_features.get("dias_desde_inicio_poliza", 999))

    row["ratio_monto_suma"]          = min((monto / suma_as), 2.0) if suma_as > 0 else 0
    row["ratio_reclamado_estimado"]  = min((monto / monto_e),  5.0) if monto_e > 0 else 1
    row["borde_vigencia_critico"]    = int(dias_in <= 10)
    row["borde_vigencia_medio"]      = int(10 < dias_in <= 30)
    row["proveedor_lista_restrictiva_enc"] = int(
        str(siniestro_features.get("en_lista_restrictiva", "No")).strip() == "Sí"
    )
    row["docs_inconsistentes_enc"] = int(
        str(siniestro_features.get("documentos_inconsistentes", "No")).strip() == "Sí"
    )
    row["mora_enc"] = int(
        str(siniestro_features.get("mora_actual", "No")).strip() == "Sí"
    )
    row["perfil_riesgo_enc"] = int(
        str(siniestro_features.get("es_perfil_riesgo", "No")).strip() == "Sí"
    )

    X = pd.DataFrame([{f: row.get(f, 0) for f in feats}])
    prob = float(modelo.predict_proba(X)[0, 1])
    pred = int(prob >= 0.5)

    if prob < 0.3:
        nivel = "Bajo"
    elif prob < 0.6:
        nivel = "Medio"
    else:
        nivel = "Alto"

    return {
        "prob_fraude_ml":  round(prob, 4),
        "pred_fraude_ml":  pred,
        "nivel_riesgo_ml": nivel,
        "modelo_usado":    bundle["model_name"]
    }


# ─────────────────────────────────────────────
# 5. FUNCIÓN PRINCIPAL
# ─────────────────────────────────────────────

def ejecutar_modelo(data_dir: str = DATA_DIR, output_dir: str = OUTPUT_DIR):
    """Ejecuta el pipeline completo de entrenamiento y predicción."""
    print("\n" + "="*60)
    print("🚀 FRAUDIA — MODELO ML SUPERVISADO")
    print("="*60)

    # 1. Cargar y construir features
    df_enriquecido = cargar_y_construir_features(data_dir)

    # 2. Preparar X, y
    X, y, feature_names = construir_features(df_enriquecido)

    # 3. Entrenar y evaluar
    resultados, mejor_key, X_test, y_test = entrenar_y_evaluar(
        X, y, feature_names, output_dir
    )

    # 4. Generar predicciones completas
    df_con_ml = generar_predicciones_completas(df_enriquecido, feature_names, output_dir)

    # 5. Resumen final
    mejor = resultados[mejor_key]
    print("\n" + "="*60)
    print("✅ PIPELINE COMPLETADO")
    print("="*60)
    print(f"  🏆 Mejor modelo:  {mejor['name']}")
    print(f"  📊 AUC-ROC:       {mejor['metrics']['auc_roc']:.4f}")
    print(f"  📊 F1-Score:      {mejor['metrics']['f1_score']:.4f}")
    print(f"  📊 Precision:     {mejor['metrics']['precision']:.4f}")
    print(f"  📊 Recall:        {mejor['metrics']['recall']:.4f}")
    print(f"  💾 Modelo:        {os.path.join(output_dir, 'best_fraud_model.pkl')}")
    print(f"  📤 Predicciones:  {os.path.join(output_dir, 'siniestros_con_ml.csv')}")

    return df_con_ml, resultados


if __name__ == "__main__":
    ejecutar_modelo()
