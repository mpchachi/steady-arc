# NeuroTransa — Stroke Rehabilitation Platform

Rehabilitation platform using eye tracking, EMG, and grip sensors to assess and monitor stroke recovery. Built for the SteadyArc Hackathon.

---

## Quick Start

### Requirements
- Node.js 18+
- Chrome or Edge (required for Web Serial API and eye tracking)
- Webcam

### Install & Run

```bash
git clone https://github.com/mpchachi/steady-arc.git
cd steady-arc/frontend
npm install
```

Create the file `frontend/.env.local` with the following content:

```
VITE_SEESO_LICENSE_KEY=dev_tndb27gx8r2u0ymvur504a2qr4sfrziip91b97x3
```

Then start the dev server:

```bash
npm run dev
```

Open the URL shown in the terminal (usually **http://localhost:5173**).

---

## Eye Tracking Calibration

On first load the app will ask for camera permission and run a 16-point calibration. Follow the dots on screen — it takes about 30 seconds. Calibration is saved in localStorage and reused in future sessions.

---

## Playing Without Arduino

The game works fully without hardware using keyboard fallback:

| Key | Action |
|-----|--------|
| `Space` | Grip / detonate mine |
| `←` `→` | Move wrist bar left / right |
| `Escape` | Skip current phase |
| `C` | Toggle demo mode (shows realistic positive results) |

---

## Arduino Setup (Optional)

Hardware needed: Arduino Uno/Nano, flex sensor (A0), EMG sensor (A3), MPU6050 (I2C).

1. Open `arduino/hand_sensor_v3.ino` in Arduino IDE
2. Select the correct board and port under `Tools`
3. Upload the sketch
4. In the game, click **Conectar Arduino**

Sensor wiring:
- Flex sensor → A0
- EMG sensor → A3
- MPU6050 SDA → A4, SCL → A5

---

## Demo Mode

Press **C** at any point during the game (or click the small button top-right) to toggle demo mode. When active, the end-of-session dashboard will display a realistic positive recovery trajectory instead of live data — useful for presentations and videos.

---

## Project Structure

```
steady-arc/
├── frontend/          # React + TypeScript + Vite
│   ├── src/
│   │   ├── games/fishing/         # Main game logic and dashboard
│   │   ├── core/eyeTracking/      # Eyedid SDK integration + Kalman filter
│   │   ├── core/input/            # Arduino serial bridge + keyboard fallback
│   │   └── core/telemetry/        # Clinical metrics calculator
│   └── public/
├── arduino/
│   └── hand_sensor_v3.ino         # Arduino firmware
├── lambda/
│   └── index_with_bedrock.mjs     # AWS Lambda (DynamoDB + Bedrock report)
└── technical_qa.md                # Technical Q&A for demo video
```

---

## Backend (AWS)

The app connects to an API Gateway endpoint that handles:
- `POST /session` — save session to DynamoDB
- `GET /session?patient_id=` — fetch full patient history
- `POST /report` — generate clinical report via Amazon Bedrock (Nova Lite, eu-central-1)

The Lambda code is in `lambda/index_with_bedrock.mjs`.

---

## Clinical Metrics Computed

| Metric | Description |
|--------|-------------|
| `grip_MVC` | Peak grip force in Newtons |
| `grip_release_time` | Time to release from peak (ms) |
| `emg_cocontraction_ratio` | Agonist/antagonist EMG ratio |
| `neglect_index` | Gaze fraction in left vs right hemispace |
| `left_RT` / `right_RT` | Mean reaction time per hemispace (ms) |
| `RT_gaze_to_grip` | Latency gaze fixation → grip activation (ms) |
| `wrist_MT` | Wrist movement time (ms) |
| `wrist_SPARC` | Wrist movement smoothness (spectral arc-length) |
| `attention_mean` | Fraction of time gaze on target zone |
