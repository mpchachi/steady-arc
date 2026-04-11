# Technical Q&A — NeuroTransa Implementation

---

## Q1: ¿Cómo capturan los datos físicos del paciente?

Dos canales de sensor en paralelo. Un Arduino envía a 50 Hz métricas de fuerza de agarre (grip MVC en Newtons) y señal EMG de los músculos del antebrazo a través del puerto serie a 115.200 baudios. El navegador lo recibe mediante la Web Serial API sin ningún driver adicional. Simultáneamente, la cámara web alimenta el SDK de eye tracking Eyedid/SeeSo, que devuelve coordenadas de mirada calibradas a ~30 fps procesadas con un filtro de Kalman para suavizar el ruido.

---

## Q2: ¿Cómo se convierten esos datos brutos en métricas clínicas?

Durante la sesión de juego se calculan en tiempo real diez biomarcadores:

| Métrica | Origen |
|---|---|
| `grip_MVC` | Pico de fuerza normalizado del Arduino (× 60 → Newtons) |
| `grip_release_time` | Tiempo hasta caída del 20% del pico (ms) |
| `emg_cocontraction_ratio` | Ratio agonista/antagonista de la señal EMG |
| `neglect_index` | Fracción de fijaciones en hemiespacio derecho vs izquierdo |
| `left_RT` / `right_RT` | Tiempo de reacción medio por hemiespacio (ms) |
| `RT_gaze_to_grip` | Latencia entre fijación del objetivo y apertura del gripper |
| `wrist_MT` | Movement time del gesto de muñeca (ms) |
| `wrist_SPARC` | Suavidad del movimiento (spectral arc-length, negativo = más suave) |
| `attention_mean` | Proporción de tiempo en zona de interés visual |

---

## Q3: ¿Dónde se almacenan las sesiones y cómo se consultan?

Cada sesión se persiste en **AWS DynamoDB** (tabla `neuro-sessions`, partition key `patient_id`, sort key `session_id`) en `eu-central-1`. El frontend llama a un **API Gateway HTTP** que dispara una **Lambda en Node.js**: `POST /session` para guardar y `GET /session?patient_id=` para recuperar el historial completo. No hay caché local — DynamoDB es la única fuente de verdad.

---

## Q4: ¿Cómo funcionan los modelos ML del dashboard?

El pipeline ML es completamente causal: la sesión N sólo ve historia hasta N, nunca datos futuros. Para cada sesión se calculan cuatro domain scores (0–1) usando **regresión OLS sobre la serie temporal normalizada**:

- **Slope component (40%)**: tendencia de recuperación mediante mínimos cuadrados
- **Level component (60%)**: nivel actual normalizado respecto al rango histórico

Los cuatro dominios se fusionan en un `riskScore` ponderado:
```
riskScore = 1 − (grip×0.25 + neglect×0.30 + visuomotor×0.30 + attention×0.15)
```
El alert level (`none / watch / alert / urgent`) se mapea linealmente desde el riskScore.

---

## Q5: ¿Qué genera el informe clínico y cómo llega al médico?

Al finalizar la sesión, la Lambda invoca **Amazon Bedrock** con el modelo **Amazon Nova Lite** (`eu.amazon.nova-lite-v1:0`) en Frankfurt. El prompt incluye los diez biomarcadores, los domain scores, el riskScore y la evolución histórica. El modelo devuelve en ~2 segundos un informe estructurado en tres secciones: resumen clínico, análisis por dominio y recomendaciones terapéuticas concretas. El informe aparece en el dashboard mediante un modal accesible desde el botón *Clinical Report* del header.

---

## Flujo completo en una línea

```
Arduino (50Hz) + Cámara web → Web Serial + Eyedid SDK → 10 biomarcadores
→ POST DynamoDB (Lambda) → GET historial → OLS ML pipeline → SteadyArc dashboard
→ Bedrock Nova Lite → informe clínico estructurado
```
