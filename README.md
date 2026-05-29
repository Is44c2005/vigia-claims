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
│   ├── main.py              ← API REST con FastAPI (18 endpoints)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx          ← Navegación por tabs (6 vistas)
│   │   ├── components/
│   │   │   ├── AhorroPotencial.tsx   ← Simulación de ahorro potencial
│   │   │   ├── AnalizarNuevo.tsx     ← Evaluación de siniestros en tiempo real
│   │   │   ├── ChatIA.tsx            ← Agente conversacional
│   │   │   ├── DetalleSiniestro.tsx  ← Detalle + panel de alerta automática
│   │   │   ├── GraficosAnalisis.tsx  ← 5 gráficos interactivos
│   │   │   ├── RedRelaciones.tsx     ← Red de relaciones (3 tabs: ranking, detalle, grafo)
│   │   │   ├── Sidebar.tsx           ← Filtros globales
│   │   │   └── TablaSiniestros.tsx   ← Tabla + exportación CSV/reporte
│   │   └── lib/             ← Cliente API + utilidades
│   ├── package.json
│   └── vite.config.ts       ← Proxy /api → backend
├── src/
│   ├── rules/
│   │   └── fraud_rules.py   ← Motor de reglas (21 señales + 7 RF)
│   ├── models/
│   │   └── fraud_model.py   ← Entrenamiento ML (Random Forest)
│   ├── ai_agent/
│   │   └── claims_agent.py  ← Agente VigIA (GPT-4o)
│   └── utils/
│       └── export_report.py ← Generador de PDF de auditoría (CLI, fpdf2)
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
| Grafo de relaciones | react-force-graph-2d (Canvas, d3-force) |
| Backend | FastAPI + Uvicorn + Pandas + NumPy |
| IA | OpenAI GPT-4o |
| ML | Scikit-learn (Random Forest, AUC-ROC: 0.93) |
| Exportación | StreamingResponse CSV · fpdf2 PDF (CLI) |
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

### 5. (Opcional) Generar reporte PDF de auditoría
```bash
pip install fpdf2
python src/utils/export_report.py
# Genera reporte_auditoria_YYYY-MM-DD.pdf en el directorio actual
```

---

## Funcionalidades

### Panel Principal
Tabla filtrable de siniestros con score de riesgo, semáforo, reglas críticas activadas
y probabilidad del modelo ML. Incluye dos botones de exportación:
- **Exportar CSV**: descarga los siniestros actualmente filtrados. El nombre del archivo refleja los filtros activos (ej. `siniestros_rojo_vehiculos_score60-100_2026-05-29.csv`).
- **Reporte de Auditoría**: descarga un CSV de casos Rojo+Amarillo ordenados por
  score descendente, con las 17 columnas clave para revisión de fraude.

Encima de la tabla, tarjetas de **Simulación de Ahorro Potencial** muestran:
monto en riesgo alto (Rojo), monto en riesgo medio (Amarillo), casos para revisión
inmediata, ahorro estimado conservador (35 %) y optimista (60 %).

### Detalle de Siniestro
Búsqueda por ID. Cuando el semáforo es Rojo o Amarillo, muestra **automáticamente**
un panel de alerta antes del detalle con:
- Título de alerta con nivel de urgencia
- Reglas críticas activadas como badges
- Señales detectadas como badges
- Acción recomendada resaltada

Debajo, las métricas clave, señales detectadas, probabilidad ML y explicación
estructurada del motor de reglas (colapsable).

### Análisis Visual
Cinco gráficos interactivos:
- Distribución del semáforo de riesgo (donut)
- Histograma de scores por nivel de riesgo (barras apiladas)
- Top proveedores con más alertas rojas (barras horizontales)
- Siniestros por ramo y nivel de riesgo (barras apiladas)
- Scatter motor de reglas vs modelo ML (cuando hay datos ML)

### Red de Relaciones
Vista analítica de tres pestañas para detectar patrones de riesgo entre proveedores y asegurados:

**Pestaña 1 — Ranking de Riesgo**
- Banner de insight automático: concentración de casos Rojo en el top-3 de proveedores
- Tarjetas de métricas: proveedores en alerta, asegurados recurrentes, clústeres detectados
- Tabla de proveedores ordenada por casos rojos con barra de concentración
- Tabla de asegurados con mayor criticidad y badge de semáforo predominante
- Click en proveedor navega directamente a su pestaña de Detalle

**Pestaña 2 — Detalle Proveedor**
- Selector de proveedor (pre-cargado al primero por defecto)
- Badge de lista restrictiva cuando aplica
- Barras de distribución Rojo / Amarillo / Verde del proveedor
- Grid de métricas: monto total, promedio por caso, asegurados distintos, % docs inconsistentes
- Señales frecuentes con indicador de criticidad y frecuencia relativa
- Reglas críticas activadas (RF-xx) con chips morados
- Tabla paginada de siniestros; click en ID navega a la vista Detalle Siniestro

**Pestaña 3 — Grafo de Clúster**
- Grafo de fuerza (Canvas, react-force-graph-2d) del clúster del proveedor seleccionado
- Muestra hasta 25 nodos: siniestro, asegurado, proveedor, vehículo
- Click en nodo tipo siniestro navega a Detalle Siniestro
- Leyenda estática de colores por tipo de nodo y nivel de riesgo

### Analizar Nuevo
Formulario para evaluar un siniestro nuevo en tiempo real. El resultado muestra
el veredicto con semáforo de color, señales detectadas en lenguaje natural,
reglas críticas como badges y acción recomendada en caja destacada.

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

## Demo en vivo

URL del sistema desplegado: [URL de Render aquí]

---

## Modelo de datos

Dataset sintético de ~1,000 siniestros distribuido en 6 tablas:

| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| siniestros.csv | ~1,000 | Tabla principal con score, semáforo y señales |
| polizas.csv | ~300 | Pólizas con fechas de vigencia y suma asegurada |
| asegurados.csv | ~250 | Perfil y historial de reclamos del asegurado |
| vehiculos.csv | ~400 | Placa, chasis, marca, modelo y siniestros en 18m |
| proveedores.csv | ~60 | Talleres, clínicas y peritos con % casos observados |
| documentos.csv | ~2,983 | Documentos por siniestro con inconsistencias |

Outputs generados por el pipeline:
- siniestros_analizados.csv — resultado del motor de reglas
- siniestros_con_ml.csv — agrega probabilidad del modelo ML
- best_fraud_model.pkl — modelo Random Forest serializado

---

## Limitaciones y consideraciones

- El dataset es 100% sintético. El modelo no ha sido validado
  con datos reales de siniestros.
- El AUC-ROC de 0.93 fue medido sobre datos sintéticos
  generados con las mismas reglas del motor — puede
  sobreestimar el rendimiento real.
- El agente conversacional depende de OpenAI GPT-4o.
  Si la API no está disponible, el Tab de Chat no funciona.
- El sistema genera alertas de revisión. Existe riesgo de
  falsos positivos — el analista humano debe validar cada caso.
- El modelo no detecta fraudes sofisticados que no activen
  ninguna de las 21 señales definidas.

---

*hackIAthon 2026 · Equipo VigIA · Aseguradora del Sur · Ecuador*
