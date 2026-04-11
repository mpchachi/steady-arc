"use client"
import React, { useState, useEffect, useRef } from 'react';
import styles from './page.module.css';
import { getSessionData, EMPTY_STATE } from './mockData';
import { 
  Activity, Zap, Timer, BicepsFlexed, BrainCircuit, 
  AlertTriangle, ArrowUpRight, Maximize2, X
} from 'lucide-react';
import { 
  LineChart, Line, ResponsiveContainer, BarChart, Bar, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, Legend, CartesianGrid, XAxis, YAxis
} from 'recharts';

const METRICS_CONFIG_EVO = [
  { id: 'grip_MVC', name: 'Grip Strength', unit: 'N', higherIsBetter: true },
  { id: 'grip_release_time', name: 'Release Time', unit: 'ms', higherIsBetter: false },
  { id: 'emg_cocontraction_ratio', name: 'Cocontraction', unit: 'ratio', higherIsBetter: false },
  { id: 'neglect_index', name: 'Neglect Index', unit: '', higherIsBetter: true },
  { id: 'left_RT', name: 'Left RT', unit: 'ms', higherIsBetter: false },
  { id: 'right_RT', name: 'Right RT', unit: 'ms', higherIsBetter: false },
  { id: 'RT_gaze_to_grip', name: 'Gaze-to-Grip', unit: 'ms', higherIsBetter: false },
  { id: 'wrist_MT', name: 'Wrist MT', unit: 'ms', higherIsBetter: false },
  { id: 'wrist_SPARC', name: 'Wrist SPARC', unit: '', higherIsBetter: true },
  { id: 'attention_mean', name: 'Attention', unit: '', higherIsBetter: true }
];

const GazeHeatmap = ({ heatmapData }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !heatmapData || heatmapData.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const GRID = 80;
    const matrix = Array(GRID).fill(null).map(() => Array(GRID).fill(0));

    heatmapData.forEach(point => {
      const cx = Math.floor(point.x * GRID);
      const cy = Math.floor(point.y * GRID);
      const sigma = 8;
      const variance2 = 2 * sigma * sigma;
      const weight = point.duration_ms / 400;

      const radius = 24; 
      for(let i = Math.max(0, cx - radius); i <= Math.min(GRID - 1, cx + radius); i++) {
        for(let j = Math.max(0, cy - radius); j <= Math.min(GRID - 1, cy + radius); j++) {
          const dx = i - cx;
          const dy = j - cy;
          const distSq = dx*dx + dy*dy;
          matrix[j][i] += weight * Math.exp(-distSq / variance2);
        }
      }
    });

    let maxVal = 0;
    for(let j = 0; j < GRID; j++) {
      for(let i = 0; i < GRID; i++) {
        if(matrix[j][i] > maxVal) maxVal = matrix[j][i];
      }
    }
    if (maxVal === 0) maxVal = 1;

    const hexToRgb = (hex) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];

    const interpolate = (colorA, colorB, t) => {
      const [r1, g1, b1] = hexToRgb(colorA);
      const [r2, g2, b2] = hexToRgb(colorB);
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r}, ${g}, ${b})`;
    };

    const getColor = (intensity) => {
      if (intensity < 0.05) return '#e8f5e9';
      if (intensity < 0.20) return interpolate('#e8f5e9', '#86efac', (intensity - 0.05) / 0.15);
      if (intensity < 0.40) return interpolate('#86efac', '#22c55e', (intensity - 0.20) / 0.20);
      if (intensity < 0.55) return interpolate('#22c55e', '#facc15', (intensity - 0.40) / 0.15);
      if (intensity < 0.70) return interpolate('#facc15', '#f97316', (intensity - 0.55) / 0.15);
      if (intensity < 0.85) return interpolate('#f97316', '#ef4444', (intensity - 0.70) / 0.15);
      return interpolate('#ef4444', '#b91c1c', Math.min(1, (intensity - 0.85) / 0.15));
    };

    const cellWidth = width / GRID;
    const cellHeight = height / GRID;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d');
    
    offCtx.fillStyle = '#FFFFFF';
    offCtx.fillRect(0, 0, width, height);

    for(let j = 0; j < GRID; j++) {
      for(let i = 0; i < GRID; i++) {
        const val = matrix[j][i] / maxVal;
        offCtx.fillStyle = getColor(val);
        offCtx.fillRect(i * cellWidth, j * cellHeight, cellWidth + 1, cellHeight + 1);
      }
    }

    ctx.clearRect(0, 0, width, height);
    ctx.filter = 'blur(12px)';
    ctx.globalAlpha = 0.9; 
    ctx.drawImage(offCanvas, 0, 0);

    ctx.filter = 'none';
    ctx.globalAlpha = 1.0;

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    const thresholds = [0.3, 0.5, 0.7];
    
    for(let j = 0; j < GRID - 1; j++) {
      for(let i = 0; i < GRID - 1; i++) {
        const v = matrix[j][i] / maxVal;
        const vR = matrix[j][i+1] / maxVal;
        const vB = matrix[j+1][i] / maxVal;
        
        for (const thresh of thresholds) {
          if ((v < thresh && vR >= thresh) || (v >= thresh && vR < thresh)) {
            ctx.beginPath();
            ctx.moveTo(i * cellWidth + cellWidth, j * cellHeight);
            ctx.lineTo(i * cellWidth + cellWidth, j * cellHeight + cellHeight);
            ctx.stroke();
          }
          if ((v < thresh && vB >= thresh) || (v >= thresh && vB < thresh)) {
            ctx.beginPath();
            ctx.moveTo(i * cellWidth, j * cellHeight + cellHeight);
            ctx.lineTo(i * cellWidth + cellWidth, j * cellHeight + cellHeight);
            ctx.stroke();
          }
        }
      }
    }

    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.strokeStyle = 'rgba(156, 163, 175, 0.5)'; 
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#374151';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('LEFT', 15, 25);
    const rightText = 'RIGHT';
    const rightTextWidth = ctx.measureText(rightText).width;
    ctx.fillText(rightText, width - rightTextWidth - 15, 25);

  }, [heatmapData]);

  if (!heatmapData || heatmapData.length === 0) {
    return (
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '16px', marginTop: '24px', marginBottom: '24px', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E5E7EB' }}>
        <p style={{ color: '#6B7280' }}>No gaze data available for this session</p>
      </div>
    );
  }

  const leftPoints = heatmapData.filter(p => p.x < 0.5).length;
  const rightPoints = heatmapData.length - leftPoints;
  const leftPercent = Math.round((leftPoints / heatmapData.length) * 100);
  const rightPercent = Math.round((rightPoints / heatmapData.length) * 100);

  let leftColor = '#22C55E';
  if (leftPercent < 30) leftColor = '#EF4444';
  else if (leftPercent <= 45) leftColor = '#F97316';

  let rightColor = '#22C55E';
  if (rightPercent < 30) rightColor = '#EF4444';
  else if (rightPercent <= 45) rightColor = '#F97316';

  return (
    <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', marginTop: '24px', marginBottom: '24px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ color: '#374151', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '16px', fontWeight: '700' }}>
        GAZE HEATMAP â€” VISUAL EXPLORATION MAP
      </div>
      
      <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={450} 
          style={{ width: '100%', height: '100%', display: 'block', backgroundColor: '#FFFFFF' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
        <div style={{ width: '80%', height: '12px', borderRadius: '6px', background: 'linear-gradient(to right, #FFFFFF, #86EFAC, #22C55E, #FACC15, #F97316, #EF4444)', border: '1px solid #E5E7EB' }} />
        <div style={{ width: '80%', display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.75rem', color: '#6B7280', fontWeight: '500' }}>
          <span>Unexplored</span>
          <span>High attention</span>
        </div>
      </div>

      <div style={{ marginTop: '24px' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Hemispatial Distribution</div>
        <div style={{ display: 'flex', height: '28px', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ width: `${leftPercent}%`, backgroundColor: leftColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.85rem', fontWeight: 'bold' }}>
            {leftPercent}%
          </div>
          <div style={{ width: `${rightPercent}%`, backgroundColor: rightColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.85rem', fontWeight: 'bold' }}>
            {rightPercent}%
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [isClient, setIsClient] = useState(false);
  const [activeSession, setActiveSession] = useState(5);
  const [expandedChart, setExpandedChart] = useState(null);

  useEffect(() => setIsClient(true), []);

  if (!isClient) return null;

  const allSessions = getSessionData('P001');

  if (!allSessions || allSessions.length === 0) {
    return (
      <div className={styles.container} style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <div style={{ textAlign: 'center', fontSize: '1.2rem', color: '#64748b' }}>
          {EMPTY_STATE.message}
        </div>
      </div>
    );
  }

  const currentIndex = Math.min(activeSession, allSessions.length - 1);
  const session = allSessions[currentIndex];
  const { metrics, globalStatus, radar } = session;

  const getRiskColor = (score) => {
    if (score < 0.25) return '#22C55E';
    if (score <= 0.65) return '#F59E0B';
    return '#EF4444';
  };
  
  const getRiskText = (score) => {
    if (score < 0.25) return 'Estable';
    if (score <= 0.65) return 'Vigilar';
    return 'Alerta';
  };

  const getAlertInfo = (level) => {
    switch(level) {
      case 'none': return { text: 'Sin alerta', color: '#22C55E' };
      case 'watch': return { text: 'Vigilar', color: '#F59E0B' };
      case 'alert': return { text: 'Alerta', color: '#F97316' };
      case 'urgent': return { text: 'URGENTE', color: '#EF4444' };
      default: return { text: 'Desconocido', color: '#9CA3AF' };
    }
  };

  const getDomainInfo = (status) => {
    switch(status) {
      case 'improving': 
        return { text: 'Mejorando', color: '#22C55E', bgColor: 'rgba(34, 197, 94, 0.15)', icon: 'â–²', borderColor: '#22C55E' };
      case 'stable': 
        return { text: 'Estable', color: '#6B7280', bgColor: 'rgba(156, 163, 175, 0.15)', icon: 'â†’', borderColor: '#D1D5DB' };
      case 'early_decline': 
        return { text: 'Vigilar', color: '#F97316', bgColor: 'rgba(249, 115, 22, 0.15)', icon: 'â–¼', borderColor: '#F97316' };
      case 'deteriorating': 
        return { text: 'Alerta', color: '#EF4444', bgColor: 'rgba(239, 68, 68, 0.15)', icon: 'â–¼â–¼', borderColor: '#EF4444' };
      default: 
        return { text: 'Desconocido', color: '#9CA3AF', bgColor: 'rgba(156, 163, 175, 0.15)', icon: '?', borderColor: '#E5E7EB' };
    }
  };

  const riskScoreVal = globalStatus.riskScore || 0;
  const alertLevelStr = globalStatus.alertLevel || 'none';
  const alertInfo = getAlertInfo(alertLevelStr);
  const doms = globalStatus.domains || {};

  const domainCardsConfig = [
    { key: 'grip', title: 'Grip Strength' },
    { key: 'neglect', title: 'Hemispatial Neglect' },
    { key: 'visuomotor', title: 'Visuomotor & Coord.' },
    { key: 'attention', title: 'Attention & Focus' }
  ];

  const visibleEvolutionData = allSessions.slice(0, currentIndex + 1);
  
  const allGrips = allSessions.map(s => s.metrics.grip_MVC).filter(v => v !== undefined);
  const minGrip = Math.min(...allGrips);
  const maxGrip = Math.max(...allGrips);
  
  const allSparcs = allSessions.map(s => s.metrics.wrist_SPARC).filter(v => v !== undefined);
  const minSparc = Math.min(...allSparcs);
  const maxSparc = Math.max(...allSparcs);

  const safeNormalize = (val, min, max) => max === min ? 0.5 : (val - min) / (max - min);

  const finalEvoChart = visibleEvolutionData.map(s => ({
    name: s.id,
    neglect_index: s.metrics.neglect_index,
    attention_mean: s.metrics.attention_mean,
    raw_grip: s.metrics.grip_MVC,
    grip_norm: safeNormalize(s.metrics.grip_MVC, minGrip, maxGrip),
    sparc_norm: safeNormalize(s.metrics.wrist_SPARC, minSparc, maxSparc)
  }));


  const radarData = [
    { subject: 'Grip', val: radar.Grip, base: 100 },
    { subject: 'Neglect', val: radar.Neglect, base: 100 },
    { subject: 'Visuomotor', val: radar.Visuomotor, base: 100 },
    { subject: 'Attention', val: radar.Attention, base: 100 },
  ];

  const renderRadarChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart cx="50%" cy="50%" outerRadius={expandedChart ? "80%" : "65%"} data={radarData}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="subject" tick={{fontSize: expandedChart ? 16 : 10, fontWeight: 600, fill: '#64748b'}} />
        <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
        <Radar name="Baseline (Healthy Range)" dataKey="base" stroke="#e2e8f0" fill="#f8fafc" fillOpacity={0.8} />
        <Radar name={`Session ${session.id}`} dataKey="val" stroke="#007aff" fill="#007aff" fillOpacity={0.2} strokeWidth={2} />
        <Legend iconType="circle" wrapperStyle={expandedChart ? {fontSize: '16px'} : {fontSize: '12px'}} />
      </RadarChart>
    </ResponsiveContainer>
  );

  const renderLineChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={finalEvoChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{fontSize: expandedChart ? 16 : 10, fontWeight: 500}} tickLine={false} axisLine={false} />
        <YAxis tick={{fontSize: expandedChart ? 16 : 10, fontWeight: 500}} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)'}} />
        <Legend iconType="circle" wrapperStyle={expandedChart ? {fontSize: '16px', fontWeight: 600} : {fontSize: '12px', fontWeight: 600}} />
        <Line type="monotone" dataKey="neglect_index" name="Neglect Index" stroke="#22c55e" strokeWidth={expandedChart ? 4 : 2} dot={{r: expandedChart ? 8 : 4}} activeDot={{r: 8}} />
        <Line type="monotone" dataKey="grip_norm" name="Grip (Norm)" stroke="#3b82f6" strokeWidth={expandedChart ? 4 : 2} dot={{r: expandedChart ? 8 : 4}} activeDot={{r: 8}} />
        <Line type="monotone" dataKey="sparc_norm" name="Wrist SPARC (Norm)" stroke="#a855f7" strokeWidth={expandedChart ? 4 : 2} strokeDasharray="5 5" dot={{r: expandedChart ? 8 : 4}} />
        <Line type="monotone" dataKey="attention_mean" name="Attention" stroke="#f97316" strokeWidth={expandedChart ? 4 : 2} dot={{r: expandedChart ? 8 : 4}} activeDot={{r: 8}} />
      </LineChart>
    </ResponsiveContainer>
  );

  const getMetricValueSafe = (sObj, k) => {
    if (sObj.metrics && sObj.metrics[k] !== undefined) return sObj.metrics[k];
    return 0;
  };

  const EvolutionMetricCard = ({ config }) => {
    const currentVal = getMetricValueSafe(session, config.id);
    const hasPrevious = currentIndex > 0;
    const prevVal = hasPrevious ? getMetricValueSafe(allSessions[currentIndex - 1], config.id) : null;
    
    let isGood = false;
    let isBad = false;
    let deltaRaw = 0;
    let percentRaw = 0;

    if (hasPrevious) {
      deltaRaw = currentVal - prevVal;
      percentRaw = prevVal === 0 ? 0 : (deltaRaw / Math.abs(prevVal)) * 100;
      if (config.higherIsBetter) {
        isGood = deltaRaw > 0;
        isBad = deltaRaw < 0;
      } else {
        isGood = deltaRaw < 0;
        isBad = deltaRaw > 0;
      }
    }

    let status = 'neutral';
    if (hasPrevious && Math.abs(deltaRaw) > 0.001) {
      if (isGood) status = 'good';
      if (isBad) status = 'bad';
    }

    let colorClassObj = {
      card: styles.evoCardNeutral,
      text: styles.evoDeltaNeutral,
      barActive: status === 'good' ? '#22c55e' : status === 'bad' ? '#ef4444' : '#d1d5db',
      arrow: ''
    };

    if (status === 'good') {
      colorClassObj.card = styles.evoCardGood;
      colorClassObj.text = styles.evoDeltaGood;
      colorClassObj.arrow = 'â–²';
    } else if (status === 'bad') {
      colorClassObj.card = styles.evoCardBad;
      colorClassObj.text = styles.evoDeltaBad;
      colorClassObj.arrow = 'â–¼';
    }

    const chartData = allSessions.slice(0, currentIndex + 1).map((s, idx) => ({
      name: 'S' + (idx + 1),
      value: getMetricValueSafe(s, config.id),
      isActive: idx === currentIndex
    }));

    return (
      <div className={`${styles.evoCard} ${colorClassObj.card}`}>
        <div className={styles.evoLeft}>
          <div className={styles.evoName} title={config.name}>
            {config.name}
          </div>
          <div className={styles.evoValue}>
            {currentVal % 1 === 0 ? currentVal : currentVal.toFixed(2)}
          </div>
          {!hasPrevious ? (
            <div className={styles.evoFirstSession}>Primera sesiÃ³n â€” baseline en construcciÃ³n</div>
          ) : deltaRaw === 0 ? (
            <div className={styles.evoDeltaNeutral}>â€” estable vs S anterior</div>
          ) : (
            <div className={colorClassObj.text}>
              {colorClassObj.arrow} {percentRaw > 0 ? '+' : ''}{percentRaw.toFixed(1)}% vs S anterior
            </div>
          )}
        </div>
        <div className={styles.evoRight}>
          <ResponsiveContainer width="100%" height={55}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} dy={-2} />
              <Bar dataKey="value" isAnimationActive={false}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.isActive ? colorClassObj.barActive : '#d1d5db'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const pulseClass = 
    alertLevelStr === 'urgent' ? styles.pulseUrgent :
    alertLevelStr === 'alert' ? styles.pulseAlert :
    alertLevelStr === 'watch' ? styles.pulseWatch :
    styles.pulseStable;

  let efficiencyPercent = 0;
  if (allSessions[0] && metrics.wrist_MT && allSessions[0].metrics.wrist_MT) {
    efficiencyPercent = ((allSessions[0].metrics.wrist_MT - metrics.wrist_MT) / allSessions[0].metrics.wrist_MT) * 100;
  }
  const efficiencyFormatted = efficiencyPercent > 0 ? `+${efficiencyPercent.toFixed(0)}` : efficiencyPercent.toFixed(0);

  const sessions = visibleEvolutionData;

  return (
    <div className={styles.container}>
      
      <div className={styles.heroSection}>
        <div className={styles.headerTop}>
          <div className={styles.logoArea}>
            STEADYARC
          </div>
        </div>

        <div className={styles.heroImageWrapper}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brain_bg.png" alt="Brain Scan 3D" className={`${styles.heroImage} ${pulseClass}`} />
          
          <div className={styles.floatingWidget} style={{ top: '10%', right: '5%' }}>
            <div className={styles.widgetDot} style={{ color: '#8b5cf6' }} />
            <div>
              <div className={styles.widgetLabel}>Neglect Index</div>
              <div className={styles.widgetValue}>
                {metrics.neglect_index !== undefined ? metrics.neglect_index.toFixed(2) : '0.00'}
              </div>
            </div>
          </div>

          <div className={styles.floatingWidget} style={{ top: '15%', left: '5%' }}>
            <div className={styles.widgetDot} style={{ color: '#34c759' }} />
            <div>
              <div className={styles.widgetLabel}>Wrist SPARC</div>
              <div className={styles.widgetValue}>
                 {metrics.wrist_SPARC !== undefined ? metrics.wrist_SPARC.toFixed(2) : '0'}
              </div>
            </div>
          </div>

          <div className={styles.floatingWidget} style={{ top: '45%', right: '2%' }}>
            <div className={styles.widgetDot} style={{ color: '#5856d6' }} />
            <div>
              <div className={styles.widgetLabel}>Gaze-to-Grip</div>
              <div className={styles.widgetValue}>
                 {metrics.RT_gaze_to_grip !== undefined ? metrics.RT_gaze_to_grip : '0'} <span style={{fontSize:'0.9rem', color:'#64748b'}}>ms</span>
              </div>
            </div>
          </div>

          <div className={styles.floatingWidget} style={{ top: '50%', left: '2%' }}>
            <div className={styles.widgetDot} style={{ color: '#f97316' }} />
            <div>
              <div className={styles.widgetLabel}>Grip MVC</div>
              <div className={styles.widgetValue}>
                 {metrics.grip_MVC !== undefined ? metrics.grip_MVC.toFixed(2) : '0.00'} <span style={{fontSize:'0.9rem', color:'#64748b'}}>N</span>
              </div>
            </div>
          </div>

          <div className={styles.floatingWidget} style={{ bottom: '15%', right: '10%' }}>
            <div className={styles.widgetDot} style={{ color: '#0ea5e9' }} />
            <div>
              <div className={styles.widgetLabel}>Attention</div>
              <div className={styles.widgetValue}>
                 {metrics.attention_mean !== undefined ? metrics.attention_mean.toFixed(2) : '0'}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.timelineWrapper}>
          {allSessions.map((s, index) => (
            <button 
              key={s.id} 
              className={`${styles.timelineBtn} ${activeSession === index ? styles.timelineBtnActive : ''}`}
              onClick={() => setActiveSession(index)}
            >
              {s.id}
            </button>
          ))}
        </div>


      </div>


      <div className={styles.metricsSection}>

        <div className={styles.topSummarySection}>
          
          <div className={styles.summaryRowA}>
            <div className={styles.summaryCardA} style={{ borderTopColor: getRiskColor(riskScoreVal) }}>
              <div className={styles.summaryLabel}>RISK SCORE</div>
              <div className={styles.summaryValueBig} style={{ color: getRiskColor(riskScoreVal) }}>
                {riskScoreVal.toFixed(3)}
              </div>
              <div className={styles.summarySubtext} style={{ color: '#6B7280' }}>
                {getRiskText(riskScoreVal)}
              </div>
            </div>

            <div className={styles.summaryCardA} style={{ borderTopColor: alertInfo.color }}>
              <div className={styles.summaryLabel}>NIVEL ALERTA</div>
              <div className={styles.summaryValueBig} style={{ color: alertInfo.color, fontSize: '1.6rem', marginTop: '0.4rem' }}>
                {alertInfo.text}
              </div>
              <div className={styles.summarySubtext} style={{ color: '#9CA3AF' }}>
                {alertLevelStr.toUpperCase()}
              </div>
            </div>

            <div className={styles.summaryCardA} style={{ borderTopColor: '#3B82F6' }}>
              <div className={styles.summaryLabel}>PACIENTE</div>
              <div className={styles.summaryValueBig} style={{ color: '#3B82F6' }}>
                64 aÃ±os
              </div>
              <div className={styles.summarySubtext} style={{ color: '#9CA3AF' }}>
                STROKE (ICTUS) RIGHT
              </div>
            </div>
          </div>

          <div className={styles.summaryRowB} style={{ marginBottom: '8px' }}>
            {domainCardsConfig.map((dom, i) => {
              const statusKey = doms[dom.key] || 'stable';
              const domInfo = getDomainInfo(statusKey);
              return (
                <div key={i} className={styles.domainCard} style={{ borderColor: domInfo.borderColor }}>
                  <div className={styles.domainCornerDot} style={{ backgroundColor: domInfo.color }} />
                  <div className={styles.domainHeaderLabel}>DOMINIO</div>
                  <div className={styles.domainName} style={{ fontSize: dom.title.length > 15 ? '0.78rem' : '0.9rem', wordBreak: 'break-word', overflowWrap: 'break-word', hyphens: 'auto' }}>
                    {dom.title}
                  </div>
                  <div className={styles.domainBadge} style={{ backgroundColor: domInfo.bgColor, color: domInfo.color }}>
                    <span>{domInfo.icon}</span>
                    <span>{domInfo.text}</span>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        <div className={styles.separatorLine} />

        <GazeHeatmap heatmapData={session?.gaze_heatmap} />

        <div className={`${styles.summaryBlock} ${globalStatus.learningEffectWarning ? styles.summaryAlertMode : ''}`} style={{ marginTop: '8px' }}>
           {globalStatus.learningEffectWarning ? <AlertTriangle className={styles.summaryIcon}/> : <Activity className={styles.summaryIcon}/>}
           <div>
             <strong style={{display:'block', marginBottom:'0.25rem'}}>Clinical Synthesis (Session {session.id})</strong>
             <span style={{fontSize: '0.9rem', lineHeight: '1.4'}}>
               {globalStatus.clinicalSynthesis || "Waiting for synthesis."}
             </span>
           </div>
        </div>

        {(() => {
          const currentIndex = allSessions.findIndex(s => s.id === session.id);
          const activeSessions = allSessions.slice(0, currentIndex + 1);
          const scores = activeSessions.map((s, i) => ({ 
            x: i + 1, 
            y: s.globalStatus.riskScore 
          }));
          const n = scores.length;
          
          if (n < 3) return (
            <div style={{
              background: '#F9FAFB',
              borderRadius: '12px',
              padding: '14px 18px',
              border: '1px solid #E5E7EB',
              marginTop: '12px'
            }}>
              <div style={{ fontSize: '0.65rem', color: '#9CA3AF',
                            letterSpacing: '0.08em', marginBottom: '6px',
                            textTransform: 'uppercase' }}>
                Recovery Projection
              </div>
              <div style={{ color: '#9CA3AF', fontSize: '0.8rem' }}>
                â€” Need 3+ sessions to generate projection
              </div>
            </div>
          );

          const sumX = scores.reduce((a, b) => a + b.x, 0);
          const sumY = scores.reduce((a, b) => a + b.y, 0);
          const sumXY = scores.reduce((a, b) => a + b.x * b.y, 0);
          const sumX2 = scores.reduce((a, b) => a + b.x * b.x, 0);
          const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
          const intercept = (sumY - slope * sumX) / n;
          const sessionTarget = (0.25 - intercept) / slope;
          const sessionsRemaining = Math.max(0, Math.ceil(sessionTarget - n));
          const currentRisk = scores[n - 1].y;
          const progress = Math.min(100, Math.max(0,
            ((0.82 - currentRisk) / (0.82 - 0.25)) * 100
          ));
          const progressColor = progress < 33 ? '#EF4444' 
            : progress < 66 ? '#F97316' : '#22C55E';

          return (
            <div style={{
              background: '#F9FAFB',
              borderRadius: '12px',
              padding: '14px 18px',
              border: '1px solid #E5E7EB',
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.65rem', color: '#9CA3AF',
                              letterSpacing: '0.08em', marginBottom: '4px',
                              textTransform: 'uppercase' }}>
                  Recovery Projection
                </div>
                {sessionsRemaining === 0 ? (
                  <div style={{ color: '#22C55E', fontWeight: 700, fontSize: '1rem' }}>
                    âœ“ Functional threshold reached
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ color: '#111827', fontWeight: 700, fontSize: '1.6rem' }}>
                      {sessionsRemaining}
                    </span>
                    <span style={{ color: '#6B7280', fontSize: '0.78rem' }}>
                      sessions to functional recovery
                    </span>
                  </div>
                )}
                <div style={{ marginTop: '8px' }}>
                  <div style={{ background: '#E5E7EB', borderRadius: '999px', 
                                height: '6px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${progress}%`, height: '100%',
                      background: progressColor, borderRadius: '999px',
                      transition: 'width 0.5s ease' 
                    }} />
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#9CA3AF', marginTop: '4px' }}>
                    {Math.round(progress)}% recovery progress
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        <div className={styles.cardsGrid}>
          
          <div className={styles.statCard}>
            <div className={styles.cardHeader}>
              <span>Grip Strength</span>
              <Activity size={16} className={styles.cardHeaderIcon} style={{color: '#f97316'}}/>
            </div>
            <div className={styles.cardValueContainer}>
              <span className={styles.cardValueMain}>
                 {metrics.grip_MVC !== undefined ? metrics.grip_MVC.toFixed(2) : '0.00'}
              </span>
              <span className={styles.cardValueSub}>N</span>
            </div>
            <div className={styles.chartMiniArea}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={finalEvoChart}>
                  <Line type="monotone" dataKey="raw_grip" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.cardHeader}>
              <span>Neurological Footprint</span>
              <button className={styles.expandBtn} onClick={() => setExpandedChart('radar')} title="Expandir">
                <Maximize2 size={14} />
              </button>
            </div>
            <div className={styles.chartMiniArea} style={{height: '140px', marginTop: 0}}>
              {renderRadarChart()}
            </div>
          </div>

          <div className={`${styles.statCard} ${styles.statCardWide}`}>
            <div className={styles.cardHeader}>
              <span>Movement Velocity & Efficiency</span>
              <ArrowUpRight size={16} />
            </div>
            
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
              <div>
                <div style={{color: '#64748b', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.2rem'}}>Wrist MT</div>
                <div className={styles.cardValueContainer}>
                  <span className={styles.cardValueMain}>
                     {metrics.wrist_MT !== undefined ? metrics.wrist_MT : '0'}
                  </span>
                  <span className={styles.cardValueSub}>ms</span>
                </div>
              </div>
              <div style={{textAlign: 'right'}}>
                <div style={{color: '#64748b', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.2rem'}}>Action Efficiency</div>
                <div className={styles.cardValueContainer} style={{justifyContent: 'flex-end'}}>
                  <span className={styles.cardValueMain}>
                     {efficiencyFormatted}
                  </span>
                  <span className={styles.cardValueSub}>%</span>
                </div>
              </div>
            </div>

            <div className={styles.progressBarContainer}>
               <div 
                 className={styles.progressBarFill} 
                 style={{
                   width: Math.min(100, Math.max(0, 50 + efficiencyPercent)) + '%', 
                   background: 'linear-gradient(90deg, #60a5fa 0%, #3b82f6 100%)'
                 }}
               />
            </div>
          </div>

          <div className={`${styles.statCard} ${styles.statCardWide}`}>
            <div className={styles.cardHeader}>
              <span>Longitudinal Evolution (% vs Baseline)</span>
              <button className={styles.expandBtn} onClick={() => setExpandedChart('line')} title="Expandir">
                <Maximize2 size={16} />
              </button>
            </div>
            <div className={styles.chartContainerWide}>
              {renderLineChart()}
            </div>
          </div>

        </div>

        <div className={styles.evoSection}>
          <div className={styles.evoTitle}>
            STROKE BIOMARKERS â€” SESSION vs BASELINE
          </div>
          <div className={styles.evoGrid}>
            {METRICS_CONFIG_EVO.map(conf => (
              <EvolutionMetricCard key={conf.id} config={conf} />
            ))}
          </div>
        </div>

      </div>

      {expandedChart && (
        <div className={styles.modalOverlay} onClick={() => setExpandedChart(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setExpandedChart(null)}>
              <X size={24} />
            </button>
            <div className={styles.modalTitle}>
              {expandedChart === 'radar' ? `Neurological Footprint - Session ${session.id}` : 'Longitudinal Evolution (% vs Baseline)'}
            </div>
            <div className={styles.modalChartArea}>
              {expandedChart === 'radar' ? renderRadarChart() : renderLineChart()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
