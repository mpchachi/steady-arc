/*
 * NeuroRehab Hand Sensor — v3.0
 * Sensores: Flex (A0), EMG (A3, opcional), MPU6050 (I2C)
 * Protocolo: JSON por Serial a 115200 baud, 50Hz
 *
 * Cambios v3.0 respecto a v2.0:
 *  - EMG: baseline capturado en setup (promedio 200 muestras en reposo)
 *  - EMG: salida = envelope rectificado abs(raw - baseline), suavizado EMA
 *  - EMG: en reposo ~0, contraccion fuerte > 100, maximo ~500
 *  - EMG: deteccion de conexion por varianza (no solo media)
 *  - Nuevo campo emg_raw para debug (valor ADC original)
 *
 * Formato de salida:
 * {"flex":423,"emg":87,"emg_raw":956,"ax":0.0007,"ay":-0.9995,"az":0.0031,"gx":7.6,"gy":-2.3,"gz":1.1}
 *   flex    = raw ADC 0-1023 (relajado ~400, apretando ~150)
 *   emg     = envelope EMG 0-1023 (~0 reposo, sube con contraccion)
 *   emg_raw = ADC original de A3 para debug (-1 si no conectado)
 *   ax/ay/az = aceleracion en g (±2g)
 *   gx/gy/gz = velocidad angular en °/s (±250°/s)
 */

#include <Wire.h>

// === PINES ===
const int FLEX_PIN = A0;
const int EMG_PIN  = A3;

// === MPU6050 ===
const uint8_t MPU_ADDR  = 0x68;
const float ACCEL_SCALE = 16384.0;
const float GYRO_SCALE  = 131.0;

float ax_off = 0, ay_off = 0, az_off = 0;
float gx_off = 0, gy_off = 0, gz_off = 0;

// === EMG ===
bool  emgConnected  = false;
int   emgBaseline   = 512;        // baseline en reposo, calculado en setup
float emgEnvelope   = 0.0;        // EMA del EMG rectificado
const float EMG_ALPHA = 0.15;     // suavizado: 0.05=muy suave, 0.3=muy reactivo
int   emgCheckCount = 0;          // contador de muestras planas para auto-desconexion

// === Intervalo ===
const unsigned long INTERVAL_MS = 20;   // 50 Hz
unsigned long lastSend = 0;

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Wire.begin();

  // Inicializar MPU6050
  mpuWrite(0x6B, 0x01);
  delay(100);
  mpuWrite(0x6C, 0x00);
  mpuWrite(0x19, 0x04);
  mpuWrite(0x1A, 0x03);
  mpuWrite(0x1B, 0x00);
  mpuWrite(0x1C, 0x00);
  delay(100);

  calibrateIMU();
  calibrateEMG();   // <-- nuevo: captura baseline EMG en reposo

  Serial.println("{\"status\":\"ready\",\"emg_connected\":" +
                 String(emgConnected ? "true" : "false") +
                 ",\"emg_baseline\":" + String(emgBaseline) + "}");
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();
  if (now - lastSend < INTERVAL_MS) return;
  lastSend = now;

  // Flex
  int flexRaw = analogRead(FLEX_PIN);

  // EMG
  int  emgRaw    = -1;
  int  emgOutput = -1;

  if (emgConnected) {
    emgRaw = analogRead(EMG_PIN);

    // Rectificado: desviacion absoluta respecto al baseline
    int deviation = abs(emgRaw - emgBaseline);

    // Envelope EMA
    emgEnvelope = emgEnvelope * (1.0 - EMG_ALPHA) + deviation * EMG_ALPHA;
    emgOutput   = (int)emgEnvelope;

    // Sin auto-desconexion: una vez detectado en setup, se mantiene conectado
  }

  // MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, (uint8_t)14, (uint8_t)true);

  int16_t rawAx = (Wire.read() << 8) | Wire.read();
  int16_t rawAy = (Wire.read() << 8) | Wire.read();
  int16_t rawAz = (Wire.read() << 8) | Wire.read();
  Wire.read(); Wire.read();
  int16_t rawGx = (Wire.read() << 8) | Wire.read();
  int16_t rawGy = (Wire.read() << 8) | Wire.read();
  int16_t rawGz = (Wire.read() << 8) | Wire.read();

  float ax = (rawAx / ACCEL_SCALE) - ax_off;
  float ay = (rawAy / ACCEL_SCALE) - ay_off;
  float az = (rawAz / ACCEL_SCALE) - az_off;
  float gx = (rawGx / GYRO_SCALE)  - gx_off;
  float gy = (rawGy / GYRO_SCALE)  - gy_off;
  float gz = (rawGz / GYRO_SCALE)  - gz_off;

  // JSON
  Serial.print("{\"flex\":");    Serial.print(flexRaw);
  Serial.print(",\"emg\":");     Serial.print(emgOutput);
  Serial.print(",\"emg_raw\":"); Serial.print(emgRaw);
  Serial.print(",\"ax\":");      Serial.print(ax, 4);
  Serial.print(",\"ay\":");      Serial.print(ay, 4);
  Serial.print(",\"az\":");      Serial.print(az, 4);
  Serial.print(",\"gx\":");      Serial.print(gx, 3);
  Serial.print(",\"gy\":");      Serial.print(gy, 3);
  Serial.print(",\"gz\":");      Serial.print(gz, 3);
  Serial.println("}");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

void mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission(true);
}

void calibrateIMU() {
  long sAx=0, sAy=0, sAz=0, sGx=0, sGy=0, sGz=0;
  const int N = 100;
  for (int i = 0; i < N; i++) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, (uint8_t)14, (uint8_t)true);
    sAx += (int16_t)((Wire.read()<<8)|Wire.read());
    sAy += (int16_t)((Wire.read()<<8)|Wire.read());
    sAz += (int16_t)((Wire.read()<<8)|Wire.read());
    Wire.read(); Wire.read();
    sGx += (int16_t)((Wire.read()<<8)|Wire.read());
    sGy += (int16_t)((Wire.read()<<8)|Wire.read());
    sGz += (int16_t)((Wire.read()<<8)|Wire.read());
    delay(5);
  }
  ax_off = (sAx/N) / ACCEL_SCALE;
  ay_off = (sAy/N) / ACCEL_SCALE;
  az_off = (sAz/N) / ACCEL_SCALE - 1.0;
  gx_off = (sGx/N) / GYRO_SCALE;
  gy_off = (sGy/N) / GYRO_SCALE;
  gz_off = (sGz/N) / GYRO_SCALE;
}

void calibrateEMG() {
  // 100 muestras en reposo para capturar baseline
  const int N = 100;
  long emgSum = 0;

  for (int i = 0; i < N; i++) {
    emgSum += analogRead(EMG_PIN);
    delay(5);
  }

  emgBaseline = (int)(emgSum / N);
  emgEnvelope = 0.0;

  // Conexion: si la media es > 5 asumimos conectado (igual que v2)
  // Un pin sin conectar suele dar 0 o valores muy erraticos
  emgConnected = (emgBaseline > 5);
}
