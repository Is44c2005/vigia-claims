# 🔍 FraudIA — Detector de Posibles Fraudes en Siniestros

**hackIAthon 2026 | Reto Aseguradora del Sur (Ecuador)**

> Sistema híbrido de detección de posibles fraudes en siniestros de seguros,
> combinando motor de reglas de negocio, modelo ML supervisado y agente conversacional con IA.

---

## ⚠️ Principio clave

Este sistema genera **alertas de revisión**, nunca acusaciones de fraude.
La decisión final **siempre es humana**. Todos los datos son 100% sintéticos.

---

## 🏗️ Arquitectura

```
fraudia-claims/
├── data/
│   ├── synthetic/       ← 6 CSVs del dataset (1,000 siniestros)
│   └── processed/       ← Outputs del motor y del modelo ML
├── src/
│   ├── rules/
│   │   └── fraud_rules.py    ← Motor de reglas (21 señales + 7 RF)
│   ├── models/
│   │   └── fraud_model.py    ← ML supervisado (RF + XGBoost)
│   ├── ai_agent/
│   │   └── claims_agent.py   ← Agente conversacional (OpenAI API)
│   └── app/
│       └── main.py           ← Dashboard Streamlit
├── requirements.txt
└── README.md
```

---

## 🚀 Instalación y Ejecución

### 1. Instalar dependencias
```bash
pip install -r requirements.txt
```

### 2. Configurar API Key de OpenAI
```bash
export OPENAI_API_KEY="tu_api_key_aquí"
# O crea un archivo .env (copia .env.example):
echo "OPENAI_API_KEY=tu_api_key_aquí" > .env
```

### 3. Ejecutar el motor de reglas
```bash
python src/rules/fraud_rules.py
# Genera: data/processed/siniestros_analizados.csv
```

### 4. Entrenar el modelo ML
```bash
python src/models/fraud_model.py
# Genera: data/processed/best_fraud_model.pkl
#          data/processed/siniestros_con_ml.csv
```

### 5. Lanzar el dashboard
```bash
streamlit run src/app/main.py
```

---

## 📊 Métricas del Modelo ML

| Modelo | AUC-ROC | F1-Score | Precision | Recall |
|--------|---------|----------|-----------|--------|
| **Random Forest** ✅ | **0.9331** | **0.7907** | 0.8500 | 0.7391 |
| XGBoost | 0.9274 | 0.7848 | 0.9394 | 0.6739 |

### Top Features de Importancia:
1. `score_riesgo` (26.4%) — Score del motor de reglas
2. `num_señales` (10.1%) — Cantidad de señales activadas
3. `historial_siniestros_asegurado` (9.8%)
4. `monto_promedio_reclamado` (5.2%) — Del proveedor
5. `porcentaje_casos_observados` (4.4%) — Del proveedor

---

## 🔴 Resultados del Motor de Reglas

| Semáforo | Cantidad | % |
|----------|----------|---|
| 🔴 Rojo | 150 | 15% |
| 🟡 Amarillo | 250 | 25% |
| 🟢 Verde | 600 | 60% |

- **Monto total en riesgo** (casos Rojos): ~$2.8M
- **Regla más activada**: RF-07 (Narrativa clonada) — 821 casos
- **Regla más crítica**: RF-03 (Proveedor lista restrictiva) — 131 casos

---

## 🤖 Capacidades del Agente IA

El agente `ClaimsAgent` (powered by GPT-4o) puede responder:
- "¿Cuáles son los 10 siniestros con mayor riesgo?"
- "¿Por qué SIN-0064 fue marcado como Rojo?"
- "¿Qué proveedores concentran el 80% de las alertas rojas?"
- "¿Qué patrones se repiten entre los siniestros sospechosos?"
- "Genera un resumen ejecutivo de los casos críticos"

---

## 🎯 Componentes del Sistema Híbrido

### 1. Motor de Reglas de Negocio (fraud_rules.py)
- 21 señales ponderadas (S01-S21)
- 7 reglas críticas (RF-01 a RF-07)
- Score 0-100 con semáforo Verde/Amarillo/Rojo
- Explicación textual por señal

### 2. Modelo ML Supervisado (fraud_model.py)
- Random Forest + XGBoost
- 35 features cruzando las 6 tablas
- AUC-ROC: 0.9331
- Probabilidad de fraude por siniestro (0.0-1.0)

### 3. Agente Conversacional (claims_agent.py)
- GPT-4o (OpenAI API)
- Contexto enriquecido con datos reales
- Historial multi-turno
- Lenguaje de "posible fraude" / "requiere revisión"

### 4. Dashboard Streamlit (main.py)
- Métricas resumen con semáforo
- Tabla filtrable ordenada por score
- Vista detalle con señales activadas
- Gráficos interactivos (Plotly)
- Chat integrado con el agente IA
- Análisis de siniestros nuevos en tiempo real

---

## 🛡️ Ética y Seguridad

- ✅ Datos 100% sintéticos
- ✅ Sin información personal real
- ✅ Lenguaje de alerta, no acusación
- ✅ Revisión humana obligatoria
- ✅ Explicabilidad total del score
- ✅ Limitaciones documentadas
- ✅ No se exponen credenciales en el código

---

*hackIAthon 2026 · Equipo FraudIA · Aseguradora del Sur · Ecuador*
