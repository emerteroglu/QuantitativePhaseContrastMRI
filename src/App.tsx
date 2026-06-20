import { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import confetti from 'canvas-confetti';
import { 
  FileText, 
  Download, 
  Activity 
} from 'lucide-react';

import type { ParsedDicomFile } from './utils/dicomParser';
import { type Point } from './utils/segmenter';
import { 
  type FrameMetrics, 
  type CycleSummary, 
  calculateFrameMetrics, 
  calculateCycleSummary, 
  type PixelMappingFormat 
} from './utils/flowMath';
import { generateSyntheticDicomData } from './utils/syntheticData';

import { DicomUploader } from './components/DicomUploader';
import { DicomViewer } from './components/DicomViewer';
import { ControlBar } from './components/ControlBar';
import { MetadataPanel } from './components/MetadataPanel';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { VisualCharts } from './components/VisualCharts';

interface FrameRoi {
  type: 'circle' | 'polygon';
  circleCenter: Point;
  circleRadius: number;
  polygonPoints: Point[];
  isClosed: boolean;
}

const defaultRoi = (width: number, height: number): FrameRoi => ({
  type: 'circle',
  circleCenter: { x: Math.round(width / 2), y: Math.round(height / 2) },
  circleRadius: 6,
  polygonPoints: [],
  isClosed: false
});

function App() {
  // DICOM frames
  const [magnitudeFiles, setMagnitudeFiles] = useState<ParsedDicomFile[]>([]);
  const [phaseFiles, setPhaseFiles] = useState<ParsedDicomFile[]>([]);
  
  // Player state
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(10);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Settings & Calibration
  const [venc, setVenc] = useState<number>(15.0);
  const [mappingFormat, setMappingFormat] = useState<PixelMappingFormat>('auto');
  const [pixelSpacingX, setPixelSpacingX] = useState<number>(1.0);
  const [pixelSpacingY, setPixelSpacingY] = useState<number>(1.0);
  const [cardiacCycleOverride, setCardiacCycleOverride] = useState<number>(800);
  const [colormap, setColormap] = useState<'grayscale' | 'flow'>('grayscale');

  // ROI State
  const [roiType, setRoiType] = useState<'circle' | 'polygon'>('circle');
  const [staticRoi, setStaticRoi] = useState<boolean>(true); // copy ROI across frames
  
  // We keep an array of ROIs, one for each frame
  const [rois, setRois] = useState<FrameRoi[]>([]);
  
  // Calculated analytics
  const [frameMetricsList, setFrameMetricsList] = useState<FrameMetrics[]>([]);
  const [cycleSummary, setCycleSummary] = useState<CycleSummary | null>(null);

  // Handlers for DICOM loading
  const handleDataLoaded = (mag: ParsedDicomFile[], ph: ParsedDicomFile[]) => {
    setMagnitudeFiles(mag);
    setPhaseFiles(ph);
    setCurrentFrameIndex(0);
    setIsPlaying(false);

    if (mag.length > 0) {
      const firstMag = mag[0];
      const cols = firstMag.columns;
      const rows = firstMag.rows;

      // Extract details
      setPixelSpacingX(firstMag.pixelSpacingX);
      setPixelSpacingY(firstMag.pixelSpacingY);
      
      // Auto Venc extraction (checks Phase files first, then falls back to Magnitude files)
      const firstPh = ph[0];
      const detectedVenc = (firstPh && firstPh.venc && firstPh.venc > 0)
        ? firstPh.venc
        : (firstMag && firstMag.venc && firstMag.venc > 0)
          ? firstMag.venc
          : null;

      if (detectedVenc) {
        setVenc(detectedVenc);
      } else {
        setVenc(15.0); // Standard default for CSF aqueduct
      }

      // Estimate cardiac cycle duration from trigger times
      if (mag.length > 1) {
        const sorted = [...mag].sort((a, b) => a.triggerTime - b.triggerTime);
        const avgStep = (sorted[sorted.length - 1].triggerTime - sorted[0].triggerTime) / (sorted.length - 1);
        const duration = Math.round(sorted[sorted.length - 1].triggerTime + avgStep);
        setCardiacCycleOverride(duration);
      } else {
        setCardiacCycleOverride(800);
      }

      // Initialize ROIs for all frames
      const initialRois = Array.from({ length: mag.length }, () => defaultRoi(cols, rows));
      setRois(initialRois);
    }
  };

  const handleLoadSample = () => {
    setIsLoading(true);
    // Simulate short load delay for organic clinical feel
    setTimeout(() => {
      const demoFrames = generateSyntheticDicomData();
      
      // Separate magnitude and phase
      const mag = demoFrames.map(f => ({
        fileName: `DEMO_MAG_FRAME_${f.frameIndex}.dcm`,
        patientName: f.patientName,
        patientId: f.patientId,
        studyDate: f.studyDate,
        seriesDescription: f.seriesDescription + "_MAG",
        seriesNumber: 2,
        imageNumber: f.frameIndex + 1,
        triggerTime: f.triggerTime,
        rows: f.rows,
        columns: f.columns,
        pixelSpacingX: f.pixelSpacingX,
        pixelSpacingY: f.pixelSpacingY,
        venc: f.venc,
        rescaleSlope: 1.0,
        rescaleIntercept: 0.0,
        windowCenter: 200,
        windowWidth: 400,
        bitsAllocated: 16,
        bitsStored: 16,
        pixelRepresentation: 1,
        pixelData: f.magnitudePixels,
        isSigned: true,
        isPhase: false
      }));

      const ph = demoFrames.map(f => ({
        fileName: `DEMO_PHASE_FRAME_${f.frameIndex}.dcm`,
        patientName: f.patientName,
        patientId: f.patientId,
        studyDate: f.studyDate,
        seriesDescription: f.seriesDescription + "_PHASE",
        seriesNumber: 3,
        imageNumber: f.frameIndex + 1,
        triggerTime: f.triggerTime,
        rows: f.rows,
        columns: f.columns,
        pixelSpacingX: f.pixelSpacingX,
        pixelSpacingY: f.pixelSpacingY,
        venc: f.venc,
        rescaleSlope: 1.0,
        rescaleIntercept: 0.0,
        windowCenter: 0,
        windowWidth: 8192,
        bitsAllocated: 16,
        bitsStored: 16,
        pixelRepresentation: 1,
        pixelData: f.phasePixels,
        isSigned: true,
        isPhase: true
      }));

      handleDataLoaded(mag, ph);
      setIsLoading(false);
      
      // Pop a nice toast or notice
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 }
      });
    }, 600);
  };

  const handleClearData = () => {
    setMagnitudeFiles([]);
    setPhaseFiles([]);
    setRois([]);
    setFrameMetricsList([]);
    setCycleSummary(null);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
  };

  // Helper: check if a pixel is inside a polygon
  const isPointInPolygon = (p: Point, polygon: Point[]): boolean => {
    let isInside = false;
    let minX = polygon[0].x, maxX = polygon[0].x;
    let minY = polygon[0].y, maxY = polygon[0].y;
    
    for (let i = 1; i < polygon.length; i++) {
      const q = polygon[i];
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }

    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
      return false;
    }

    let i = 0, j = polygon.length - 1;
    for (i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (
        ((polygon[i].y > p.y) !== (polygon[j].y > p.y)) &&
        (p.x < ((polygon[j].x - polygon[i].x) * (p.y - polygon[i].y)) / (polygon[j].y - polygon[i].y) + polygon[i].x)
      ) {
        isInside = !isInside;
      }
    }
    return isInside;
  };

  // Compute binary pixel mask for a specific FrameRoi configuration
  const computeRoiMask = (roi: FrameRoi, cols: number, rows: number): boolean[] => {
    const mask = new Array(cols * rows).fill(false);
    
    if (roi.type === 'circle') {
      const { x: cx, y: cy } = roi.circleCenter;
      const r = roi.circleRadius;
      const r2 = r * r;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
            mask[y * cols + x] = true;
          }
        }
      }
    } else if (roi.type === 'polygon') {
      if (!roi.isClosed || roi.polygonPoints.length < 3) {
        return mask;
      }
      
      // Speed up by scanning bounding box
      let minX = cols, maxX = 0, minY = rows, maxY = 0;
      roi.polygonPoints.forEach(pt => {
        minX = Math.min(minX, pt.x);
        maxX = Math.max(maxX, pt.x);
        minY = Math.min(minY, pt.y);
        maxY = Math.max(maxY, pt.y);
      });

      minX = Math.max(0, Math.floor(minX));
      maxX = Math.min(cols - 1, Math.ceil(maxX));
      minY = Math.max(0, Math.floor(minY));
      maxY = Math.min(rows - 1, Math.ceil(maxY));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (isPointInPolygon({ x, y }, roi.polygonPoints)) {
            mask[y * cols + x] = true;
          }
        }
      }
    }

    return mask;
  };

  // Update a single frame's ROI in state
  const updateActiveRoi = (updater: (roi: FrameRoi) => Partial<FrameRoi>) => {
    if (rois.length === 0) return;
    
    const newRois = [...rois];
    const activeRoi = newRois[currentFrameIndex];
    const updated = { ...activeRoi, ...updater(activeRoi) };

    if (staticRoi) {
      // Propagate the changes to all frames
      for (let i = 0; i < newRois.length; i++) {
        newRois[i] = { ...updated };
      }
    } else {
      // Dynamic ROI (adjusts only active frame)
      newRois[currentFrameIndex] = updated;
    }
    
    setRois(newRois);
  };

  // Manual Propagation trigger
  const handlePropagateRoi = () => {
    if (rois.length === 0 || magnitudeFiles.length === 0) return;
    const activeRoi = rois[currentFrameIndex];
    const newRois = [...rois];

    for (let i = 0; i < newRois.length; i++) {
      newRois[i] = { ...activeRoi };
    }
    setRois(newRois);
    
    // Celebrate!
    confetti({
      particleCount: 40,
      angle: 60,
      spread: 55,
      origin: { x: 0 }
    });
    confetti({
      particleCount: 40,
      angle: 120,
      spread: 55,
      origin: { x: 1 }
    });
  };

  const handleClearRoi = () => {
    if (magnitudeFiles.length === 0) return;
    const cols = magnitudeFiles[0].columns;
    const rows = magnitudeFiles[0].rows;
    const cleared = Array.from({ length: magnitudeFiles.length }, () => defaultRoi(cols, rows));
    setRois(cleared);
  };

  // Calculate flow math whenever ROIs, files, or calibration parameters update
  useEffect(() => {
    if (magnitudeFiles.length === 0 || phaseFiles.length === 0 || rois.length === 0) {
      setFrameMetricsList([]);
      setCycleSummary(null);
      return;
    }

    const metrics: FrameMetrics[] = [];
    const numFrames = magnitudeFiles.length;

    for (let i = 0; i < numFrames; i++) {
      const magFile = magnitudeFiles[i];
      const phFile = phaseFiles[i];
      const roi = rois[i];

      if (!phFile) continue;

      // Compute mask
      const mask = computeRoiMask(roi, magFile.columns, magFile.rows);
      
      const frameMetric = calculateFrameMetrics(
        mask,
        phFile.pixelData,
        magFile.columns,
        magFile.rows,
        pixelSpacingX,
        pixelSpacingY,
        venc,
        mappingFormat,
        phFile.rescaleSlope,
        phFile.rescaleIntercept,
        phFile.isSigned,
        i,
        magFile.triggerTime
      );

      metrics.push(frameMetric);
    }

    setFrameMetricsList(metrics);

    const summary = calculateCycleSummary(metrics, cardiacCycleOverride);
    setCycleSummary(summary);

  }, [
    magnitudeFiles,
    phaseFiles,
    rois,
    venc,
    mappingFormat,
    pixelSpacingX,
    pixelSpacingY,
    cardiacCycleOverride
  ]);

  // Check if current active frame has a drawn/configured ROI
  const hasActiveRoi = () => {
    if (rois.length === 0) return false;
    const active = rois[currentFrameIndex];
    if (active.type === 'circle') return active.circleRadius > 1;
    if (active.type === 'polygon') return active.polygonPoints.length > 0;
    return false;
  };

  // EXPORT CSV
  const handleExportCSV = () => {
    if (frameMetricsList.length === 0 || !cycleSummary) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "FlowMRI Post-Processing Quantitative Report\n";
    csvContent += `Patient Name,${magnitudeFiles[0].patientName}\n`;
    csvContent += `Patient ID,${magnitudeFiles[0].patientId}\n`;
    csvContent += `Study Date,${magnitudeFiles[0].studyDate}\n`;
    csvContent += `Pixel Spacing (mm),${pixelSpacingX} x ${pixelSpacingY}\n`;
    csvContent += `Venc (cm/s),${venc}\n\n`;
    
    csvContent += "Summary Metrics\n";
    csvContent += `Aqueductal Stroke Volume (uL/beat),${Math.round(cycleSummary.strokeVolumeUl)}\n`;
    csvContent += `Aqueductal Stroke Volume (uL/sec),${Math.round(cycleSummary.strokeVolumePerSecUl)}\n`;
    csvContent += `Forward Stroke Volume (uL),${Math.round(cycleSummary.forwardStrokeVolumeUl)}\n`;
    csvContent += `Backward Stroke Volume (uL),${Math.round(cycleSummary.backwardStrokeVolumeUl)}\n`;
    csvContent += `Net Stroke Volume (uL),${Math.round(cycleSummary.netStrokeVolumeUl)}\n`;
    csvContent += `Regurgitant Fraction (%),${cycleSummary.regurgitantFractionPercent.toFixed(2)}\n`;
    csvContent += `Peak Systolic Speed (cm/s),${cycleSummary.peakSystolicVelocityCms.toFixed(2)}\n`;
    csvContent += `Peak Diastolic Speed (cm/s),${cycleSummary.peakDiastolicVelocityCms.toFixed(2)}\n`;
    csvContent += `Avg Aqueduct Area (mm2),${cycleSummary.averageAreaMm2.toFixed(2)}\n\n`;

    csvContent += "Frame-by-Frame Data\n";
    csvContent += "Frame,Trigger Time (ms),Area (mm2),Mean Velocity (cm/s),Peak Systolic Velocity (cm/s),Peak Diastolic Velocity (cm/s),Flow Rate (mL/s),Forward Flow Rate (mL/s),Backward Flow Rate (mL/s)\n";

    frameMetricsList.forEach(f => {
      csvContent += `${f.frameIndex + 1},${f.triggerTime.toFixed(1)},${f.areaMm2.toFixed(2)},${f.meanVelocity.toFixed(2)},${f.peakSystolicVelocity.toFixed(2)},${f.peakDiastolicVelocity.toFixed(2)},${f.flowRate.toFixed(4)},${f.forwardFlowRate.toFixed(4)},${f.backwardFlowRate.toFixed(4)}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `FlowMRI_Report_${magnitudeFiles[0].patientId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // EXPORT PDF REPORT (Hospital Grade)
  const handleExportPDF = () => {
    if (frameMetricsList.length === 0 || !cycleSummary) return;

    const doc = new jsPDF();
    const pInfo = magnitudeFiles[0];

    // Color Palette
    const darkBlue = [15, 23, 42]; // #0f172a
    const cyan = [6, 182, 212];    // #06b6d4
    const gray = [148, 163, 184];  // #94a3b8

    // 1. Report Header
    doc.setFillColor(darkBlue[0], darkBlue[1], darkBlue[2]);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text("FlowMRI Post-Processing", 15, 20);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(cyan[0], cyan[1], cyan[2]);
    doc.text("QUANTITATIVE CSF PHASE-CONTRAST MRI REPORT", 15, 28);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text("CONFIDENTIAL MEDICAL REPORT", 160, 20);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 160, 25);

    // 2. Patient Demographics & Acquisition
    doc.setTextColor(darkBlue[0], darkBlue[1], darkBlue[2]);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Patient Demographics & Scan Info", 15, 52);
    doc.setDrawColor(226, 232, 240);
    doc.line(15, 55, 195, 55);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    
    // Column 1
    doc.setFont("Helvetica", "bold"); doc.text("Patient Name:", 15, 62);
    doc.setFont("Helvetica", "normal"); doc.text(pInfo.patientName, 43, 62);
    
    doc.setFont("Helvetica", "bold"); doc.text("Patient ID:", 15, 68);
    doc.setFont("Helvetica", "normal"); doc.text(pInfo.patientId, 43, 68);
    
    doc.setFont("Helvetica", "bold"); doc.text("Study Date:", 15, 74);
    doc.setFont("Helvetica", "normal"); doc.text(pInfo.studyDate, 43, 74);

    // Column 2
    doc.setFont("Helvetica", "bold"); doc.text("Voxel Size:", 110, 62);
    doc.setFont("Helvetica", "normal"); doc.text(`${pixelSpacingX.toFixed(2)} x ${pixelSpacingY.toFixed(2)} mm`, 135, 62);
    
    doc.setFont("Helvetica", "bold"); doc.text("Venc Setting:", 110, 68);
    doc.setFont("Helvetica", "normal"); doc.text(`${venc} cm/s`, 135, 68);
    
    doc.setFont("Helvetica", "bold"); doc.text("Cardiac Cycle:", 110, 74);
    doc.setFont("Helvetica", "normal"); doc.text(`${cardiacCycleOverride} ms (${cycleSummary.heartRateBpm} BPM)`, 135, 74);

    // 3. Quantitative Analysis Metrics
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13);
    doc.text("CSF Flow Quantitative Analytics Summary", 15, 88);
    doc.line(15, 91, 195, 91);

    // Table rows
    const stats = [
      { label: "Aqueductal Stroke Volume (Default)", val: `${Math.round(cycleSummary.strokeVolumeUl)} uL`, desc: `(${cycleSummary.strokeVolumeMl.toFixed(3)} mL per beat, (|Fwd| + |Bwd|)/2)` },
      { label: "Aqueductal Stroke Volume (Per Second)", val: `${Math.round(cycleSummary.strokeVolumePerSecUl)} uL/s`, desc: `(${cycleSummary.strokeVolumePerSecMl.toFixed(3)} mL/s)` },
      { label: "Forward Stroke Volume (Caudal flow)", val: `${Math.round(cycleSummary.forwardStrokeVolumeUl)} uL`, desc: `(${cycleSummary.forwardStrokeVolumeMl.toFixed(3)} mL per heart beat)` },
      { label: "Backward Stroke Volume (Cranial flow)", val: `${Math.round(cycleSummary.backwardStrokeVolumeUl)} uL`, desc: `(${cycleSummary.backwardStrokeVolumeMl.toFixed(3)} mL per heart beat)` },
      { label: "Net Stroke Volume (Caudal - Cranial)", val: `${Math.round(cycleSummary.netStrokeVolumeUl)} uL`, desc: `(${cycleSummary.netStrokeVolumeMl.toFixed(3)} mL per heart beat)` },
      { label: "Regurgitant Fraction", val: `${cycleSummary.regurgitantFractionPercent.toFixed(1)} %`, desc: "(Normal CSF physiology usually < 10% net)" },
      { label: "Peak Systolic Flow Speed", val: `+${cycleSummary.peakSystolicVelocityCms.toFixed(2)} cm/s`, desc: "Maximum caudal velocity" },
      { label: "Peak Diastolic Flow Speed", val: `${cycleSummary.peakDiastolicVelocityCms.toFixed(2)} cm/s`, desc: "Maximum cranial velocity" },
      { label: "Mean Net Flow Rate", val: `${cycleSummary.meanFlowRateMlSec.toFixed(3)} mL/s`, desc: `(${(cycleSummary.meanFlowRateMlMin * 60).toFixed(1)} mL/hour net production)` },
      { label: "Mean Aqueduct Cross-section Area", val: `${cycleSummary.averageAreaMm2.toFixed(1)} mm2`, desc: "(Evaluated via Magnitude boundaries)" }
    ];

    let rowY = 98;
    stats.forEach((s, idx) => {
      // Zebra striping
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(15, rowY - 4, 180, 7, 'F');
      }
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(darkBlue[0], darkBlue[1], darkBlue[2]);
      doc.text(s.label, 17, rowY);
      
      doc.setTextColor(cyan[0], cyan[1], cyan[2]);
      doc.text(s.val, 105, rowY);
      
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(gray[0], gray[1], gray[2]);
      doc.setFontSize(8.5);
      doc.text(s.desc, 132, rowY);
      
      rowY += 7.5;
    });

    // 4. Capture Canvas Visuals
    const magCanvas = document.querySelector('.viewer-card:nth-child(1) canvas') as HTMLCanvasElement;
    const phaseCanvas = document.querySelector('.viewer-card:nth-child(2) canvas') as HTMLCanvasElement;

    if (magCanvas && phaseCanvas) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(darkBlue[0], darkBlue[1], darkBlue[2]);
      doc.text("Acquisition Image Verification & ROI Placement", 15, rowY + 10);
      doc.line(15, rowY + 13, 195, rowY + 13);

      try {
        const magImgData = magCanvas.toDataURL("image/jpeg", 0.9);
        const phaseImgData = phaseCanvas.toDataURL("image/jpeg", 0.9);

        // Draw side-by-side
        doc.addImage(magImgData, "JPEG", 15, rowY + 18, 85, 85);
        doc.addImage(phaseImgData, "JPEG", 110, rowY + 18, 85, 85);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(gray[0], gray[1], gray[2]);
        doc.text("Figure A: Magnitude image with ROI outline.", 15, rowY + 107);
        doc.text("Figure B: Paired phase contrast velocity map.", 110, rowY + 107);

      } catch (err) {
        console.error("Could not add canvas images to PDF:", err);
      }
    }

    // Footnote
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text("Disclaimer: Quantitative post-processing is highly dependent on correct ROI tracing and acquisition calibration parameters. Clinically check Venc and Spacing.", 15, 287);

    doc.save(`FlowMRI_Clinical_Report_${pInfo.patientId}.pdf`);

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <Activity className="brand-icon" size={24} style={{ color: 'var(--color-accent)' }} />
          <h1>Flow<span>MRI</span></h1>
        </div>
        <div className="header-actions">
          {frameMetricsList.length > 0 && (
            <>
              <button className="btn btn-secondary" onClick={handleExportCSV}>
                <Download size={16} /> Export CSV
              </button>
              <button className="btn btn-primary" onClick={handleExportPDF}>
                <FileText size={16} /> Print PDF Report
              </button>
            </>
          )}
        </div>
      </header>

      <div className="workspace-container">
        {/* Left Side Panel */}
        <div className="sidebar">
          
          <DicomUploader
            onDataLoaded={handleDataLoaded}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            hasData={magnitudeFiles.length > 0}
            onLoadSample={handleLoadSample}
            magnitudeFiles={magnitudeFiles}
            phaseFiles={phaseFiles}
            onClear={handleClearData}
          />

          <MetadataPanel
            magnitudeFile={magnitudeFiles.length > 0 ? magnitudeFiles[0] : null}
            venc={venc}
            onVencChange={setVenc}
            mappingFormat={mappingFormat}
            onMappingFormatChange={setMappingFormat}
            pixelSpacingX={pixelSpacingX}
            pixelSpacingY={pixelSpacingY}
            onPixelSpacingChange={(x, y) => {
              setPixelSpacingX(x);
              setPixelSpacingY(y);
            }}
            cardiacCycleOverride={cardiacCycleOverride}
            onCardiacCycleOverrideChange={setCardiacCycleOverride}
            colormap={colormap}
            onColormapChange={setColormap}
          />

        </div>

        {/* Center Workspace */}
        <div className="main-content">
          {magnitudeFiles.length > 0 ? (
            <>
              {/* Canvas viewport */}
              <DicomViewer
                magnitudeFile={magnitudeFiles[currentFrameIndex]}
                phaseFile={phaseFiles[currentFrameIndex] || null}
                venc={venc}
                mappingFormat={mappingFormat}
                roiType={roiType}
                roiCircleCenter={rois[currentFrameIndex]?.circleCenter}
                roiCircleRadius={rois[currentFrameIndex]?.circleRadius}
                roiPolygonPoints={rois[currentFrameIndex]?.polygonPoints}
                isRoiClosed={rois[currentFrameIndex]?.isClosed}
                setRoiCircleCenter={(p) => updateActiveRoi(() => ({ circleCenter: p }))}
                setRoiCircleRadius={(r) => updateActiveRoi(() => ({ circleRadius: r }))}
                setRoiPolygonPoints={(pts) => updateActiveRoi(() => ({ polygonPoints: pts }))}
                setIsRoiClosed={(c) => updateActiveRoi(() => ({ isClosed: c }))}
                colormap={colormap}
                currentFrameIndex={currentFrameIndex}
                totalFrames={magnitudeFiles.length}
                onFrameChange={setCurrentFrameIndex}
              />

              {/* Scrubber playback controls */}
              <ControlBar
                currentFrameIndex={currentFrameIndex}
                totalFrames={magnitudeFiles.length}
                isPlaying={isPlaying}
                onPlayPause={() => setIsPlaying(!isPlaying)}
                onFrameChange={setCurrentFrameIndex}
                fps={fps}
                setFps={setFps}
                triggerTime={magnitudeFiles[currentFrameIndex]?.triggerTime || 0}
              />

              {/* Graphs section */}
              <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                <VisualCharts
                  framesData={frameMetricsList}
                  cardiacCycleMs={cardiacCycleOverride}
                />
              </div>
            </>
          ) : (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              flex: 1, 
              padding: '3rem',
              color: 'var(--text-secondary)'
            }}>
              <Activity size={64} style={{ opacity: 0.15, marginBottom: '1.5rem', color: 'var(--color-accent)' }} />
              <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No MRI Data Loaded</h2>
              <p style={{ maxWidth: '400px', textAlign: 'center', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Load a patient's DICOM folder containing Magnitude and Phase contrast series, or immediately try out all tools with the demo scan.
              </p>
              <button className="btn btn-primary" onClick={handleLoadSample} disabled={isLoading}>
                Launch Aqueduct CSF Simulation Demo
              </button>
            </div>
          )}
        </div>

        {/* Right Side Panel */}
        {magnitudeFiles.length > 0 && (
          <div className="sidebar" style={{ borderLeft: '1px solid var(--border-color)', borderRight: 'none' }}>
            <AnalyticsPanel
              roiType={roiType}
              setRoiType={(type) => {
                setRoiType(type);
                updateActiveRoi(() => ({ type }));
              }}
              isRoiClosed={rois[currentFrameIndex]?.isClosed || false}
              hasRoi={hasActiveRoi()}
              clearRoi={handleClearRoi}
              propagateRoi={handlePropagateRoi}
              summary={cycleSummary || {
                forwardStrokeVolumeMl: 0,
                forwardStrokeVolumeUl: 0,
                backwardStrokeVolumeMl: 0,
                backwardStrokeVolumeUl: 0,
                netStrokeVolumeMl: 0,
                netStrokeVolumeUl: 0,
                strokeVolumeMl: 0,
                strokeVolumeUl: 0,
                strokeVolumePerSecMl: 0,
                strokeVolumePerSecUl: 0,
                regurgitantFractionPercent: 0,
                peakVelocityCms: 0,
                peakSystolicVelocityCms: 0,
                peakDiastolicVelocityCms: 0,
                meanFlowRateMlSec: 0,
                meanFlowRateMlMin: 0,
                averageAreaMm2: 0,
                cardiacCycleMs: 800,
                heartRateBpm: 75
              }}
              staticRoi={staticRoi}
              setStaticRoi={setStaticRoi}
              canPropagate={!staticRoi && hasActiveRoi()}
            />
          </div>
        )}
      </div>

      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: '600' }}>
            Reconstructing Phase Contrast Matrices...
          </div>
        </div>
      )}
    </>
  );
}

export default App;
