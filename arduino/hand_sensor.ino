/*
 * NeuroRehab Hand Sensor — v2.0
 * Sensores: Flex (A0), EMG (A3, opcional), MPU6050 (I2C)
 * Protocolo: JSON por Serial a 115200 baud, 50Hz
 *
 * Formato de salida:
 * {"flex":423,"emg":128,"ax":0.0007,"ay":-0.9995,"az":0.0031,"gx":7.6,"gy":-2.3,"gz":1.1}
 *   flex  = raw ADC 0-1023
 *   emg   = raw ADC 0-1023 (-1 si no conectado)
 *   ax/ay/az = aceleracion en g (±2g)
 *   gx/gy/gz = velocidad angular en °/s (±250°/s)
 *
 * Umbrales EMG (raw ADC):
 *   0-150   ruido basal / actividad leve
 *   150-400 contraccion voluntaria fuerte
 *   400-800 fatiga / espasmo maximo
 *   800-1023 contraccion maxima
 */

#include <Wire.h>

// === PINES ===
const int FLEX_PIN = A0;
const int EMG_PIN  = A3;

// === MPU6050 ===
const uint8_t MPU_ADDR = 0x68;
const float ACCEL_SCALE = 16384.0;  // LSB/g  para ±2g
const float GYRO_SCALE  = 131.0;    // LSB/(°/s) para ±250°/s

// Offsets de calibracion (se calculan en setup)
float ax_off = 0, ay_off = 0, az_off = 0;
float gx_off = 0, gy_off = 0, gz_off = 0;

// EMG: detectar si esta conectado
bool emgConnected = false;
int emgCheckCount = 0;

// Intervalo de muestreo
const unsigned long INTERVAL_MS = 20;  // 50 Hz
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);
  Wire.begin();

  // === Inicializar MPU6050 ===
  // Despertar
  mpuWrite(0x6B, 0x01);   // PWR_MGMT_1: clock PLL con giroscopio X (mas estable)
  delay(100);
  mpuWrite(0x6C, 0x00);   // PWR_MGMT_2: todos los ejes activos
  mpuWrite(0x19, 0x04);   // SMPLRT_DIV: 1000Hz / (4+1) = 200Hz interno
  mpuWrite(0x1A, 0x03);   // CONFIG: DLPF 44Hz (filtra vibraciones >44Hz)
  mpuWrite(0x1B, 0x00);   // GYRO_CONFIG: ±250°/s
  mpuWrite(0x1C, 0x00);   // ACCEL_CONFIG: ±2g
  delay(100);

  // === Calibracion de offset (100 muestras, mano en reposo) ===
  calibrateIMU();

  // === Detectar EMG ===
  // Si A3 lee consistentemente > 10 (no flotando a 0), asumimos conectado
  long emgSum = 0;
  for (int i = 0; i < 20; i++) {
    emgSum += analogRead(EMG_PIN);
    delay(5);
  }
  emgConnected = (emgSum / 20) > 8;

  // Señal de inicio lista
  Serial.println("{\"status\":\"ready\",\"emg_connected\":" +
                 String(emgConnected ? "true" : "false") + "}");
}

void loop() {
  unsigned long now = millis();
  if (now - lastSend < INTERVAL_MS) return;
  lastSend = now;

  // === Leer Flex ===
  int flexRaw = analogRead(FLEX_PIN);

  // === Leer EMG ===
  int emgRaw = -1;
  if (emgConnected) {
    emgRaw = analogRead(EMG_PIN);
    // Auto-deteccion desconexion: si lleva mucho en 0 asumir desconectado
    if (emgRaw < 3) emgCheckCount++;
    else emgCheckCount = 0;
    if (emgCheckCount > 100) { emgConnected = false; emgRaw = -1; }
  }

  // === Leer MPU6050 ===
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, (uint8_t)14, (uint8_t)true);

  int16_t rawAx = (Wire.read() << 8) | Wire.read();
  int16_t rawAy = (Wire.read() << 8) | Wire.read();
  int16_t rawAz = (Wire.read() << 8) | Wire.read();
  Wire.read(); Wire.read();  // temperatura (no usada)
  int16_t rawGx = (Wire.read() << 8) | Wire.read();
  int16_t rawGy = (Wire.read() << 8) | Wire.read();
  int16_t rawGz = (Wire.read() << 8) | Wire.read();

  // Aplicar escala y offset
  float ax = (rawAx / ACCEL_SCALE) - ax_off;
  float ay = (rawAy / ACCEL_SCALE) - ay_off;
  float az = (rawAz / ACCEL_SCALE) - az_off;
  float gx = (rawGx / GYRO_SCALE)  - gx_off;
  float gy = (rawGy / GYRO_SCALE)  - gy_off;
  float gz = (rawGz / GYRO_SCALE)  - gz_off;

  // === Enviar JSON ===
  Serial.print("{\"flex\":");   Serial.print(flexRaw);
  Serial.print(",\"emg\":");    Serial.print(emgRaw);
  Serial.print(",\"ax\":");     Serial.print(ax, 4);
  Serial.print(",\"ay\":");     Serial.print(ay, 4);
  Serial.print(",\"az\":");     Serial.print(az, 4);
  Serial.print(",\"gx\":");     Serial.print(gx, 3);
  Serial.print(",\"gy\":");     Serial.print(gy, 3);
  Serial.print(",\"gz\":");     Serial.print(gz, 3);
  Serial.println("}");
}

// === Helpers ===

void mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission(true);
}

void calibrateIMU() {
  // Promedio de 100 muestras en reposo
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
  az_off = (sAz/N) / ACCEL_SCALE - 1.0;  // restar gravedad en Z
  gx_off = (sGx/N) / GYRO_SCALE;
  gy_off = (sGy/N) / GYRO_SCALE;
  gz_off = (sGz/N) / GYRO_SCALE;
}
