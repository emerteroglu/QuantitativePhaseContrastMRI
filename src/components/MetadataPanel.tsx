import React, { useState } from 'react';
import { EyeOff, Eye, Sliders, Info } from 'lucide-react';
import type { ParsedDicomFile } from '../utils/dicomParser';
import type { PixelMappingFormat } from '../utils/flowMath';


interface MetadataPanelProps {
  magnitudeFile: ParsedDicomFile | null;
  venc: number;
  onVencChange: (v: number) => void;
  mappingFormat: PixelMappingFormat;
  onMappingFormatChange: (fmt: PixelMappingFormat) => void;
  pixelSpacingX: number;
  pixelSpacingY: number;
  onPixelSpacingChange: (x: number, y: number) => void;
  cardiacCycleOverride: number;
  onCardiacCycleOverrideChange: (ms: number) => void;
  colormap: 'grayscale' | 'flow';
  onColormapChange: (map: 'grayscale' | 'flow') => void;
}

export const MetadataPanel: React.FC<MetadataPanelProps> = ({
  magnitudeFile,
  venc,
  onVencChange,
  mappingFormat,
  onMappingFormatChange,
  pixelSpacingX,
  pixelSpacingY,
  onPixelSpacingChange,
  cardiacCycleOverride,
  onCardiacCycleOverrideChange,
  colormap,
  onColormapChange
}) => {
  const [anonymize, setAnonymize] = useState(false);

  if (!magnitudeFile) {
    return (
      <div className="sidebar-section">
        <h3>
          <Info size={16} /> Demographics & Tags
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Please load a DICOM series to inspect demographics and acquisition parameters.
        </p>
      </div>
    );
  }

  // Mask patient details if anonymize is enabled
  const dispPatientName = anonymize ? 'PATIENT^ANONYMOUS' : magnitudeFile.patientName;
  const dispPatientId = anonymize ? 'XXXXXXXX-XX' : magnitudeFile.patientId;

  return (
    <div className="sidebar-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: '0' }}>
          <Info size={16} /> Demographics & Tags
        </h3>
        <button
          className="btn btn-secondary btn-icon-only"
          onClick={() => setAnonymize(!anonymize)}
          title={anonymize ? 'Show Patient Info' : 'Anonymize Patient Info'}
          style={{ padding: '0.25rem 0.5rem' }}
        >
          {anonymize ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>

      <table className="metadata-table" style={{ marginBottom: '1rem' }}>
        <tbody>
          <tr>
            <td className="label">Patient Name:</td>
            <td className="value">{dispPatientName}</td>
          </tr>
          <tr>
            <td className="label">Patient ID:</td>
            <td className="value">{dispPatientId}</td>
          </tr>
          <tr>
            <td className="label">Study Date:</td>
            <td className="value">
              {magnitudeFile.studyDate.substring(0, 4)}-
              {magnitudeFile.studyDate.substring(4, 6)}-
              {magnitudeFile.studyDate.substring(6, 8)}
            </td>
          </tr>
          <tr>
            <td className="label">Dimensions:</td>
            <td className="value">
              {magnitudeFile.columns}x{magnitudeFile.rows} px
            </td>
          </tr>
          <tr>
            <td className="label">Bit Depth:</td>
            <td className="value">
              {magnitudeFile.bitsStored} Stored / {magnitudeFile.bitsAllocated} Alloc
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
        <Sliders size={16} /> Calibration & Velocity
      </h3>

      {/* Venc Control */}
      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="venc-input">Velocity Encoding (Venc)</label>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-accent)', fontWeight: '600' }}>
            {magnitudeFile.venc && magnitudeFile.venc > 0 ? 'Auto-detected' : 'Manual default'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            id="venc-input"
            type="number"
            className="input-field"
            value={venc}
            onChange={(e) => onVencChange(parseFloat(e.target.value) || 15.0)}
            step="1"
            min="1"
            max="150"
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>cm/s</span>
        </div>
      </div>

      {/* Pixel format conversion */}
      <div className="form-group">
        <label htmlFor="pixel-fmt">Phase Mapping Model</label>
        <select
          id="pixel-fmt"
          className="input-field select-field"
          value={mappingFormat}
          onChange={(e) => onMappingFormatChange(e.target.value as PixelMappingFormat)}
        >
          <option value="auto">Auto-detect representation</option>
          <option value="signed16">Siemens Signed 16-bit [-4096, 4095]</option>
          <option value="unsigned12">GE Unsigned 12-bit [0, 4095]</option>
          <option value="signed12">Philips Signed 12-bit [-2048, 2047]</option>
          <option value="rescale">Rescale Slope / Intercept</option>
        </select>
      </div>

      {/* Spacing Calibration */}
      <div className="form-group">
        <label>Pixel Spacing (Voxel Size)</label>
        <div className="calib-grid">
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>X (mm)</div>
            <input
              type="number"
              className="input-field"
              value={pixelSpacingX}
              onChange={(e) => onPixelSpacingChange(parseFloat(e.target.value) || 1.0, pixelSpacingY)}
              step="0.01"
              min="0.1"
              max="5.0"
            />
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Y (mm)</div>
            <input
              type="number"
              className="input-field"
              value={pixelSpacingY}
              onChange={(e) => onPixelSpacingChange(pixelSpacingX, parseFloat(e.target.value) || 1.0)}
              step="0.01"
              min="0.1"
              max="5.0"
            />
          </div>
        </div>
      </div>

      {/* Cardiac cycle length */}
      <div className="form-group">
        <label htmlFor="cardiac-input">Cardiac Cycle Duration</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            id="cardiac-input"
            type="number"
            className="input-field"
            value={cardiacCycleOverride}
            onChange={(e) => onCardiacCycleOverrideChange(parseInt(e.target.value, 10) || 800)}
            step="10"
            min="200"
            max="2000"
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            ms ({Math.round(60000 / (cardiacCycleOverride || 800))} bpm)
          </span>
        </div>
      </div>

      {/* Colormap control */}
      <div className="form-group" style={{ marginBottom: '0' }}>
        <label>Phase Colormap</label>
        <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '0.375rem', overflow: 'hidden' }}>
          <button
            type="button"
            className="btn btn-secondary w-full"
            style={{
              borderRadius: '0',
              border: 'none',
              backgroundColor: colormap === 'flow' ? 'var(--color-accent-bg)' : 'transparent',
              color: colormap === 'flow' ? 'var(--color-accent)' : 'var(--text-secondary)',
              fontSize: '0.75rem',
              padding: '0.45rem'
            }}
            onClick={() => onColormapChange('flow')}
          >
            Clinical Flow
          </button>
          <button
            type="button"
            className="btn btn-secondary w-full"
            style={{
              borderRadius: '0',
              border: 'none',
              borderLeft: '1px solid var(--border-color)',
              backgroundColor: colormap === 'grayscale' ? 'var(--color-accent-bg)' : 'transparent',
              color: colormap === 'grayscale' ? 'var(--color-accent)' : 'var(--text-secondary)',
              fontSize: '0.75rem',
              padding: '0.45rem'
            }}
            onClick={() => onColormapChange('grayscale')}
          >
            Grayscale
          </button>
        </div>
      </div>
    </div>
  );
};
