# VigIA — Detector de Posibles Fraudes en Siniestros

**hackIAthon 2026 | Reto Aseguradora del Sur (Ecuador)**

> Sistema híbrido de detección de posibles fraudes en siniestros de seguros,
> combinando un motor de reglas de negocio, modelo ML supervisado y agente
> conversacional con IA (GPT-4o).

---

## Principio clave

Este sistema genera **alertas de revisión**, nunca acusaciones de fraude.
La decisión final **siempre es humana**. Todos los datos son 100% sintéticos.

---

## Arquitectura

```
vigia-claims/
├── backend/
│   ├── main.py              ← API REST con FastAPI (12 endpoints)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx          ← Navegación por tabs
│   │   ├── components/      ← Panel, Detalle, Gráficos, Analizar, Chat
│   │   └── lib/             ← Cliente API + utilidades
│   ├── package.json
│   └── vite.config.ts       ← Proxy /api → backend
├── src/
│   ├── rules/
│   │   └── fraud_rules.py   ← Motor de reglas (21 señales + 7 RF)
│   ├── models/
│   │   └── fraud_model.py   ← Entrenamiento ML (Random Forest)
│   └── ai_agent/
│       └── claims_agent.py  ← Agente VigIA (GPT-4o)
├── data/
│   ├── synthetic/           ← 6 CSVs del dataset (~1,000 siniestros)
│   └── processed/           ← Outputs del motor y del modelo ML
├── render.yaml              ← Configuración de despliegue en Render
└── .env.example
```

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 + Tailwind CSS |
| Datos/estado | TanStack Query v5 + Recharts |
| Backend | FastAPI + Uvicorn + Pandas + NumPy |
| IA | OpenAI GPT-4o |
| ML | Scikit-learn (Random Forest, AUC-ROC: 0.93) |
| Despliegue | Render (backend) |

---

## Instalación local

### Requisitos previos
- Python 3.10+
- Node.js 18+
- Clave de API de OpenAI

### 1. Clonar el repositorio
```bash
git clone https://github.com/Is44c2005/vigia-claims.git
cd vigia-claims
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env y agregar tu OPENAI_API_KEY
```

### 3. Levantar el backend
```bash
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001 --reload
```

### 4. Levantar el frontend (otra terminal)
```bash
cd frontend
npm install
npm run dev
# Abrir http://localhost:5173
```

> En Windows, ejecutar antes: `$env:PYTHONIOENCODING="utf-8"`

---

## Funcionalidades

### Panel Principal
Tabla filtrable de siniestros con score de riesgo, semáforo, reglas críticas activadas
y probabilidad del modelo ML. Exportación a CSV.

### Detalle de Siniestro
Búsqueda por ID. Muestra métricas clave, señales detectadas como badges,
explicación del motor de reglas y descripción del caso.

### Análisis Visual
Cuatro gráficos interactivos:
- Distribución del semáforo de riesgo (donut)
- Histograma de scores por nivel de riesgo
- Top proveedores con más alertas rojas
- Siniestros por ramo y nivel de riesgo (barras apiladas)
- Scatter motor de reglas vs modelo ML (cuando hay datos ML)

### Analizar Nuevo
Formulario para evaluar un siniestro nuevo en tiempo real. El resultado muestra
el veredicto, las señales detectadas en lenguaje natural, las reglas críticas
como badges y la acción recomendada.

### Chat con VigIA
Agente conversacional powered by GPT-4o con contexto completo del portafolio.
Responde preguntas en lenguaje natural sobre siniestros, patrones, proveedores
y distribución geográfica de alertas.

---

## Motor de detección

### Capa 1 — Motor de Reglas (21 señales ponderadas)

| Código | Señal | Puntos |
|--------|-------|--------|
| S01 | Siniestro en los primeros 10 días de póliza | 8 (crítico) |
| S11 | Proveedor en lista restrictiva | 10 |
| S16 | Documentos inconsistentes o alterados | 10 |
| S05 | Asegurado con 3+ siniestros en 18 meses | 8 |
| S03 | Demora en denuncia de robo >48h | 8 |
| ... | 16 señales adicionales | 3-6 |

**Clasificación por score:**
- Verde: 0–40 puntos
- Amarillo: 41–75 puntos
- Rojo: 76–100 puntos

**7 reglas críticas (RF-01 a RF-07)** elevan automáticamente a Rojo o Amarillo
sin importar el score acumulado.

### Capa 2 — Modelo ML (Random Forest)

| Modelo | AUC-ROC | F1-Score | Precisión | Recall |
|--------|---------|----------|-----------|--------|
| Random Forest | 0.9331 | 0.7907 | 0.8500 | 0.7391 |
| XGBoost | 0.9274 | 0.7848 | 0.9394 | 0.6739 |

Top features: `score_riesgo` (26.4%), `num_señales` (10.1%),
`historial_siniestros_asegurado` (9.8%), `monto_promedio_reclamado` (5.2%).

---

## Agente VigIA

El agente conversacional tiene contexto enriquecido que incluye:
- Top 10 siniestros de mayor riesgo con datos completos
- Top proveedores con más alertas rojas
- Distribución geográfica por ciudad (Quito, Guayaquil, Cuenca, etc.)
- Patrones por cobertura y ramo en casos sospechosos

Preguntas de ejemplo:
- "¿Cuáles son los 10 siniestros con mayor riesgo?"
- "¿Por qué SIN-0064 fue marcado como Rojo?"
- "¿Qué ciudades concentran más alertas?"
- "¿Qué patrones se repiten entre los siniestros sospechosos?"

---

## Ética y seguridad

- Datos 100% sintéticos, sin información personal real
- Lenguaje de alerta de revisión, nunca acusación de fraude
- Revisión humana obligatoria en todos los casos
- Explicabilidad total del score (señal por señal)
- Credenciales fuera del código (variables de entorno)

---

*hackIAthon 2026 · Equipo VigIA · Aseguradora del Sur · Ecuador*
