import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import type { FrameMetrics } from '../utils/flowMath';

interface VisualChartsProps {
  framesData: FrameMetrics[];
  cardiacCycleMs: number;
}

type TabType = 'flow' | 'velocity' | 'area' | 'data';

export const VisualCharts: React.FC<VisualChartsProps> = ({
  framesData,
  cardiacCycleMs
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('flow');

  if (framesData.length === 0) {
    return (
      <div className="charts-card">
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '2rem' }}>
          Please trace an ROI on the aqueduct of Sylvius to view flow curves and graphs.
        </p>
      </div>
    );
  }

  // Sort frames by trigger time for chronological plotting
  const chartData = [...framesData]
    .sort((a, b) => a.triggerTime - b.triggerTime)
    .map(f => ({
      frame: f.frameIndex + 1,
      timeMs: Math.round(f.triggerTime),
      flowRate: parseFloat(f.flowRate.toFixed(4)),
      forwardFlow: parseFloat(f.forwardFlowRate.toFixed(4)),
      backwardFlow: parseFloat(f.backwardFlowRate.toFixed(4)),
      meanVelocity: parseFloat(f.meanVelocity.toFixed(2)),
      peakSystolic: parseFloat(f.peakSystolicVelocity.toFixed(2)),
      peakDiastolic: parseFloat(f.peakDiastolicVelocity.toFixed(2)),
      area: parseFloat(f.areaMm2.toFixed(2))
    }));

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div 
          className="card" 
          style={{ 
            backgroundColor: '#0f172a', 
            border: '1px solid var(--border-color)', 
            padding: '0.5rem 0.75rem', 
            margin: 0,
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)'
          }}
        >
          <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '0.25rem' }}>Time: {label} ms</div>
          {payload.map((p: any) => (
            <div key={p.name} style={{ color: p.color, display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
              <span>{p.name}:</span>
              <span style={{ fontWeight: '600' }}>{p.value} {p.unit}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="charts-card">
      <div className="charts-tabs">
        <button
          className={`chart-tab-btn ${activeTab === 'flow' ? 'active' : ''}`}
          onClick={() => setActiveTab('flow')}
        >
          CSF Flow Rate Curve
        </button>
        <button
          className={`chart-tab-btn ${activeTab === 'velocity' ? 'active' : ''}`}
          onClick={() => setActiveTab('velocity')}
        >
          Velocity Profile
        </button>
        <button
          className={`chart-tab-btn ${activeTab === 'area' ? 'active' : ''}`}
          onClick={() => setActiveTab('area')}
        >
          Aqueduct Area
        </button>
        <button
          className={`chart-tab-btn ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Raw Analysis Data
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
        <div />
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          ACQUISITION CYCLE: {cardiacCycleMs} ms
        </div>
      </div>

      <div style={{ width: '100%', height: 320, position: 'relative', marginTop: '0.75rem' }}>
        {activeTab === 'flow' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis 
                dataKey="timeMs" 
                stroke="#64748b" 
                tickFormatter={(val) => `${val}ms`}
                label={{ value: 'Time (ms)', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 10 }}
              />
              <YAxis 
                stroke="#64748b" 
                label={{ value: 'Flow Rate (mL/s)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip content={customTooltip} />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
              <Line
                name="Net Flow Rate"
                type="monotone"
                dataKey="flowRate"
                stroke="var(--color-net)"
                strokeWidth={3}
                dot={{ r: 3, strokeWidth: 1 }}
                activeDot={{ r: 5 }}
                unit=" mL/s"
              />
              <Line
                name="Forward Flow"
                type="monotone"
                dataKey="forwardFlow"
                stroke="var(--color-forward)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={{ r: 2 }}
                unit=" mL/s"
              />
              <Line
                name="Backward Flow"
                type="monotone"
                dataKey="backwardFlow"
                stroke="var(--color-backward)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={{ r: 2 }}
                unit=" mL/s"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'velocity' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis 
                dataKey="timeMs" 
                stroke="#64748b" 
                tickFormatter={(val) => `${val}ms`}
                label={{ value: 'Time (ms)', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 10 }}
              />
              <YAxis 
                stroke="#64748b" 
                label={{ value: 'Velocity (cm/s)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip content={customTooltip} />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
              <Line
                name="Mean Velocity"
                type="monotone"
                dataKey="meanVelocity"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                unit=" cm/s"
              />
              <Line
                name="Peak Systolic"
                type="monotone"
                dataKey="peakSystolic"
                stroke="var(--color-forward)"
                strokeWidth={1.5}
                dot={{ r: 2 }}
                unit=" cm/s"
              />
              <Line
                name="Peak Diastolic"
                type="monotone"
                dataKey="peakDiastolic"
                stroke="var(--color-backward)"
                strokeWidth={1.5}
                dot={{ r: 2 }}
                unit=" cm/s"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'area' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis 
                dataKey="timeMs" 
                stroke="#64748b" 
                tickFormatter={(val) => `${val}ms`}
                label={{ value: 'Time (ms)', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 10 }}
              />
              <YAxis 
                stroke="#64748b" 
                domain={['auto', 'auto']}
                label={{ value: 'Area (mm²)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip content={customTooltip} />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Line
                name="Cross-sectional Area"
                type="monotone"
                dataKey="area"
                stroke="#a855f7"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                unit=" mm²"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'data' && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Frame</th>
                  <th>Trigger (ms)</th>
                  <th>Area (mm²)</th>
                  <th>Mean Vel (cm/s)</th>
                  <th>Peak Sys (cm/s)</th>
                  <th>Peak Dia (cm/s)</th>
                  <th>Net Flow (mL/s)</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((d) => (
                  <tr key={d.frame}>
                    <td>{d.frame}</td>
                    <td>{d.timeMs}</td>
                    <td>{d.area}</td>
                    <td>{d.meanVelocity}</td>
                    <td>{d.peakSystolic}</td>
                    <td>{d.peakDiastolic}</td>
                    <td style={{ color: d.flowRate > 0 ? 'var(--color-forward)' : d.flowRate < 0 ? 'var(--color-backward)' : '#fff' }}>
                      {d.flowRate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
