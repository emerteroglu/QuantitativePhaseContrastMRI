import React from 'react';
import { Circle, Hexagon, RefreshCw, Layers, Sparkles } from 'lucide-react';
import type { CycleSummary } from '../utils/flowMath';

interface AnalyticsPanelProps {
  roiType: 'circle' | 'polygon';
  setRoiType: (type: 'circle' | 'polygon') => void;
  
  isRoiClosed: boolean;
  hasRoi: boolean;
  clearRoi: () => void;
  
  propagateRoi: () => void;
  
  summary: CycleSummary;
  
  staticRoi: boolean;
  setStaticRoi: (b: boolean) => void;
  
  canPropagate: boolean;
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({
  roiType,
  setRoiType,
  isRoiClosed,
  hasRoi,
  clearRoi,
  propagateRoi,
  summary,
  staticRoi,
  setStaticRoi,
  canPropagate
}) => {
  const [svUnitMode, setSvUnitMode] = React.useState<'beat' | 'sec'>('beat');

  // Format numbers nicely
  const formatVol = (mlVal: number, ulVal: number) => {
    return {
      ml: mlVal.toFixed(3),
      ul: Math.round(ulVal).toString()
    };
  };

  const fwdSV = formatVol(summary.forwardStrokeVolumeMl, summary.forwardStrokeVolumeUl);
  const bwdSV = formatVol(summary.backwardStrokeVolumeMl, summary.backwardStrokeVolumeUl);
  const netSV = formatVol(summary.netStrokeVolumeMl, summary.netStrokeVolumeUl);
  const mainSV = formatVol(
    svUnitMode === 'beat' ? summary.strokeVolumeMl : summary.strokeVolumePerSecMl,
    svUnitMode === 'beat' ? summary.strokeVolumeUl : summary.strokeVolumePerSecUl
  );

  return (
    <div className="sidebar-section" style={{ borderBottom: 'none' }}>
      <h3>
        <Layers size={16} /> ROI Configuration
      </h3>

      {/* ROI Shape selector */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1rem' }}>
        <button
          className={`btn w-full ${roiType === 'circle' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '0.45rem 0.25rem', fontSize: '0.75rem', gap: '0.25rem' }}
          onClick={() => setRoiType('circle')}
          title="Circular ROI tool"
        >
          <Circle size={12} /> Circle
        </button>
        <button
          className={`btn w-full ${roiType === 'polygon' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '0.45rem 0.25rem', fontSize: '0.75rem', gap: '0.25rem' }}
          onClick={() => setRoiType('polygon')}
          title="Polygon ROI tool"
        >
          <Hexagon size={12} /> Polygon
        </button>
      </div>

      {/* Polygon not closed warning */}
      {roiType === 'polygon' && !isRoiClosed && (
        <div className="info-banner" style={{ padding: '0.5rem 0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.2)', color: '#fef3c7', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.7rem' }}>
            ⚠️ Tracing in progress. Click the first vertex (highlighted blue) to close the polygon loop and enable calculation.
          </div>
        </div>
      )}

      {/* ROI Propagation & Modifiers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary w-full"
            style={{ fontSize: '0.75rem', padding: '0.45rem' }}
            onClick={() => setStaticRoi(!staticRoi)}
            title="Toggle between copying ROI to all frames or adjusting per-frame"
          >
            {staticRoi ? 'Copy ROI to All Frames' : 'Dynamic ROI (Per Frame)'}
          </button>
        </div>

        {canPropagate && (
          <button
            className="btn btn-accent w-full"
            style={{ fontSize: '0.75rem', padding: '0.45rem' }}
            onClick={propagateRoi}
            title="Propagate this ROI to all frames in the cardiac cycle"
          >
            Propagate ROI to All Frames
          </button>
        )}

        {hasRoi && (
          <button
            className="btn btn-danger w-full"
            style={{ fontSize: '0.75rem', padding: '0.45rem' }}
            onClick={clearRoi}
          >
            <RefreshCw size={12} /> Clear ROI
          </button>
        )}
      </div>

      <h3 style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
        <Sparkles size={16} /> Clinical Metrics
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
        
        {/* Aqueductal Stroke Volume (|Fwd| + |Bwd|)/2 */}
        <div className="metric-card net" style={{ borderLeft: '4px solid var(--color-accent)', backgroundColor: 'rgba(6, 182, 212, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="metric-label" style={{ color: 'var(--color-accent)', fontWeight: '700' }}>Aqueductal Stroke Volume</div>
            <div style={{ display: 'flex', gap: '0.2rem', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '0.15rem', borderRadius: '0.25rem' }}>
              <button 
                className="btn" 
                style={{ 
                  padding: '0.15rem 0.35rem', 
                  fontSize: '0.65rem', 
                  minHeight: 'auto',
                  backgroundColor: svUnitMode === 'beat' ? 'var(--color-accent)' : 'transparent',
                  color: svUnitMode === 'beat' ? '#000' : 'var(--text-secondary)'
                }}
                onClick={() => setSvUnitMode('beat')}
              >
                /beat
              </button>
              <button 
                className="btn" 
                style={{ 
                  padding: '0.15rem 0.35rem', 
                  fontSize: '0.65rem', 
                  minHeight: 'auto',
                  backgroundColor: svUnitMode === 'sec' ? 'var(--color-accent)' : 'transparent',
                  color: svUnitMode === 'sec' ? '#000' : 'var(--text-secondary)'
                }}
                onClick={() => setSvUnitMode('sec')}
              >
                /sec
              </button>
            </div>
          </div>
          <div className="metric-value" style={{ color: 'var(--color-accent)' }}>
            {mainSV.ul} <span className="metric-unit">μL{svUnitMode === 'sec' ? '/s' : ''}</span>
          </div>
          <div className="metric-unit" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            ({mainSV.ml} mL{svUnitMode === 'sec' ? '/s' : ''}) • (|Fwd| + |Bwd|)/2
          </div>
        </div>

        {/* Stroke Volumes */}
        <div className="metric-card forward">
          <div className="metric-label">Forward Stroke Volume (Caudal)</div>
          <div className="metric-value">{fwdSV.ul} <span className="metric-unit">μL</span></div>
          <div className="metric-unit">({fwdSV.ml} mL / beat)</div>
        </div>

        <div className="metric-card backward">
          <div className="metric-label">Backward Stroke Volume (Cranial)</div>
          <div className="metric-value">{bwdSV.ul} <span className="metric-unit">μL</span></div>
          <div className="metric-unit">({bwdSV.ml} mL / beat)</div>
        </div>

        <div className="metric-card net">
          <div className="metric-label">Net Stroke Volume</div>
          <div className="metric-value">{netSV.ul} <span className="metric-unit">μL</span></div>
          <div className="metric-unit">({netSV.ml} mL / beat)</div>
        </div>

        {/* Regurgitant fraction */}
        <div className="card" style={{ padding: '0.85rem', marginBottom: '0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="metric-label">Regurgitant Fraction</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Cranial / Caudal ratio</div>
          </div>
          <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: '800', color: summary.regurgitantFractionPercent > 35 ? 'var(--color-backward)' : '#fff' }}>
            {summary.regurgitantFractionPercent.toFixed(1)}%
          </div>
        </div>

        {/* Peak Velocity */}
        <div className="card" style={{ padding: '0.85rem', marginBottom: '0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div className="metric-label">Peak Velocities</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Systolic Peak (+):</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--color-forward)' }}>
              +{summary.peakSystolicVelocityCms.toFixed(1)} cm/s
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Diastolic Peak (-):</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--color-backward)' }}>
              {summary.peakDiastolicVelocityCms.toFixed(1)} cm/s
            </span>
          </div>
        </div>

        {/* Mean Flow Rates */}
        <div className="card" style={{ padding: '0.85rem', marginBottom: '0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div className="metric-label">Mean Flow Rates</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Net Flow Rate:</span>
            <span className="font-mono font-semibold">
              {summary.meanFlowRateMlSec.toFixed(3)} mL/s
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Hourly Net Flow:</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--color-net)' }}>
              {(summary.meanFlowRateMlMin * 60).toFixed(1)} mL/hr
            </span>
          </div>
        </div>

        {/* Aqueduct size */}
        <div className="card" style={{ padding: '0.85rem', marginBottom: '0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="metric-label">Average Aqueduct Area</div>
          <div className="font-mono font-semibold" style={{ fontSize: '0.9rem' }}>
            {summary.averageAreaMm2.toFixed(1)} mm²
          </div>
        </div>

      </div>
    </div>
  );
};
