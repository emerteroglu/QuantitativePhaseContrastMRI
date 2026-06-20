import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Move, Circle, Hexagon, RefreshCw } from 'lucide-react';
import type { ParsedDicomFile } from '../utils/dicomParser';
import { type Point } from '../utils/segmenter';
import { rawToVelocity, type PixelMappingFormat } from '../utils/flowMath';

interface DicomViewerProps {
  magnitudeFile: ParsedDicomFile | null;
  phaseFile: ParsedDicomFile | null;
  venc: number;
  mappingFormat: PixelMappingFormat;
  roiType: 'circle' | 'polygon';
  roiCircleCenter: Point;
  roiCircleRadius: number;
  roiPolygonPoints: Point[];
  isRoiClosed: boolean;
  
  setRoiCircleCenter: (p: Point) => void;
  setRoiCircleRadius: (r: number) => void;
  setRoiPolygonPoints: (points: Point[]) => void;
  setIsRoiClosed: (closed: boolean) => void;
  
  colormap: 'grayscale' | 'flow';

  currentFrameIndex: number;
  totalFrames: number;
  onFrameChange: (index: number) => void;
}

export const DicomViewer: React.FC<DicomViewerProps> = ({
  magnitudeFile,
  phaseFile,
  venc,
  mappingFormat,
  roiType,
  roiCircleCenter,
  roiCircleRadius,
  roiPolygonPoints,
  isRoiClosed,
  setRoiCircleCenter,
  setRoiCircleRadius,
  setRoiPolygonPoints,
  setIsRoiClosed,
  colormap,
  currentFrameIndex,
  totalFrames,
  onFrameChange
}) => {
  const magCanvasRef = useRef<HTMLCanvasElement>(null);
  const phaseCanvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport transforms (shared/synced)
  const [zoom, setZoom] = useState<number>(3.5);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'roi' | 'pan' | 'window'>('roi');

  // Windowing state (contrast/brightness)
  const [windowCenter, setWindowCenter] = useState<number>(300);
  const [windowWidth, setWindowWidth] = useState<number>(500);

  // Mouse tracking
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [draggedElement, setDraggedElement] = useState<'center' | 'perimeter' | number | null>(null); // for editing ROIs
  const [hoverPixel, setHoverPixel] = useState<{ x: number; y: number; mag: number; phase: number } | null>(null);

  const lastSeriesKey = magnitudeFile 
    ? `${magnitudeFile.patientId}_${magnitudeFile.seriesNumber}` 
    : '';
  const lastSeriesRef = useRef<string>('');

  // Utility to convert client mouse coordinate to image pixel coordinate
  const clientToImageCoords = (
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
    cols: number,
    rows: number
  ): Point => {
    const rect = canvas.getBoundingClientRect();
    // Position inside client canvas bounding box
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    
    // Canvas dimensions
    const cw = rect.width;
    const ch = rect.height;

    // Center of canvas in image space is (cols/2, rows/2)
    // Canvas coordinates relative to center:
    const rx = cx - cw / 2;
    const ry = cy - ch / 2;

    // Apply pan and zoom
    const imgX = (rx - pan.x) / zoom + cols / 2;
    const imgY = (ry - pan.y) / zoom + rows / 2;

    return { x: Math.round(imgX), y: Math.round(imgY) };
  };

  // Utility to convert image pixel coordinate to canvas client coordinate
  const imageToCanvasCoords = (
    imgX: number,
    imgY: number,
    canvasWidth: number,
    canvasHeight: number,
    cols: number,
    rows: number
  ): Point => {
    const cx = (imgX - cols / 2) * zoom + pan.x + canvasWidth / 2;
    const cy = (imgY - rows / 2) * zoom + pan.y + canvasHeight / 2;
    return { x: cx, y: cy };
  };

  const drawViewer = () => {
    if (!magnitudeFile || !magCanvasRef.current || !phaseCanvasRef.current) return;

    const magCanvas = magCanvasRef.current;
    const phaseCanvas = phaseCanvasRef.current;
    const magCtx = magCanvas.getContext('2d');
    const phaseCtx = phaseCanvas.getContext('2d');
    
    if (!magCtx || !phaseCtx) return;

    const { rows, columns, pixelData: magData } = magnitudeFile;
    const phaseData = phaseFile?.pixelData;

    // 1. Set canvas internal resolution to client bounding box
    const rect = magCanvas.getBoundingClientRect();
    if (magCanvas.width !== Math.round(rect.width) || magCanvas.height !== Math.round(rect.height)) {
      magCanvas.width = Math.round(rect.width);
      magCanvas.height = Math.round(rect.height);
      phaseCanvas.width = Math.round(rect.width);
      phaseCanvas.height = Math.round(rect.height);
    }

    // Auto-fit zoom once parent size is known (and keep it across all frames of the same series)
    if (rect.width > 0 && lastSeriesRef.current !== lastSeriesKey) {
      lastSeriesRef.current = lastSeriesKey;
      const fitZoom = rect.width / Math.max(columns, rows);
      setZoom(fitZoom);
      setPan({ x: 0, y: 0 });
      setWindowWidth(magnitudeFile.windowWidth || 500);
      setWindowCenter(magnitudeFile.windowCenter || 300);
      return;
    }

    const cw = magCanvas.width;
    const ch = magCanvas.height;

    // Clear canvases
    magCtx.fillStyle = '#020617';
    magCtx.fillRect(0, 0, cw, ch);
    phaseCtx.fillStyle = '#020617';
    phaseCtx.fillRect(0, 0, cw, ch);

    // 2. Generate offscreen rendering images for Magnitude
    const magOffscreen = document.createElement('canvas');
    magOffscreen.width = columns;
    magOffscreen.height = rows;
    const magOffCtx = magOffscreen.getContext('2d')!;
    const magImgData = magOffCtx.createImageData(columns, rows);

    for (let i = 0; i < magData.length; i++) {
      const pv = magData[i];
      // Window level window center conversion
      // Min display level = WC - WW/2, Max display level = WC + WW/2
      const minLevel = windowCenter - windowWidth / 2;
      let gray = 0;
      if (pv <= minLevel) {
        gray = 0;
      } else if (pv >= windowCenter + windowWidth / 2) {
        gray = 255;
      } else {
        gray = Math.round(((pv - minLevel) / windowWidth) * 255);
      }

      const idx = i * 4;
      magImgData.data[idx] = gray;     // R
      magImgData.data[idx + 1] = gray; // G
      magImgData.data[idx + 2] = gray; // B
      magImgData.data[idx + 3] = 255;  // A
    }
    magOffCtx.putImageData(magImgData, 0, 0);

    // 3. Generate offscreen rendering images for Phase
    const phaseOffscreen = document.createElement('canvas');
    phaseOffscreen.width = columns;
    phaseOffscreen.height = rows;
    const phaseOffCtx = phaseOffscreen.getContext('2d')!;
    const phaseImgData = phaseOffCtx.createImageData(columns, rows);

    if (phaseData) {
      for (let i = 0; i < phaseData.length; i++) {
        const rawPhase = phaseData[i];
        const idx = i * 4;

        if (colormap === 'flow') {
          // Clinical flow colormap: 
          // Center (zero velocity) is gray [100, 100, 100]
          // Positive flow (forward/caudal) maps to Cyan [0, 180, 220]
          // Negative flow (backward/cranial) maps to Orange [240, 110, 20]
          
          // Map raw value based on venc
          // Let's deduce value ratio relative to max. Siemens maps to [-4096, 4095].
          const limit = Math.abs(rawPhase) > 4096 ? 32768 : 4096;
          const ratio = Math.max(-1.0, Math.min(1.0, rawPhase / limit));

          if (ratio >= 0) {
            // Mix gray and Cyan
            // ratio = 0 -> R:100, G:100, B:100
            // ratio = 1 -> R:6,   G:182, B:212
            phaseImgData.data[idx] = Math.round(100 * (1 - ratio) + 6 * ratio);
            phaseImgData.data[idx + 1] = Math.round(100 * (1 - ratio) + 182 * ratio);
            phaseImgData.data[idx + 2] = Math.round(100 * (1 - ratio) + 212 * ratio);
          } else {
            // Mix gray and Orange
            // absRatio = 0 -> R:100, G:100, B:100
            // absRatio = 1 -> R:249, G:115, B:22
            const absRatio = Math.abs(ratio);
            phaseImgData.data[idx] = Math.round(100 * (1 - absRatio) + 249 * absRatio);
            phaseImgData.data[idx + 1] = Math.round(100 * (1 - absRatio) + 115 * absRatio);
            phaseImgData.data[idx + 2] = Math.round(100 * (1 - absRatio) + 22 * absRatio);
          }
        } else {
          // Standard grayscale colormap
          // Phase values are usually scaled so that max/min maps to white/black
          const limit = Math.abs(rawPhase) > 4096 ? 32768 : 4096;
          const val = Math.round(((rawPhase + limit) / (limit * 2)) * 255);
          const gray = Math.max(0, Math.min(255, val));
          phaseImgData.data[idx] = gray;
          phaseImgData.data[idx + 1] = gray;
          phaseImgData.data[idx + 2] = gray;
        }
        phaseImgData.data[idx + 3] = 255;
      }
    } else {
      // No phase image loaded, draw black
      for (let i = 0; i < columns * rows; i++) {
        const idx = i * 4;
        phaseImgData.data[idx] = 15;
        phaseImgData.data[idx + 1] = 23;
        phaseImgData.data[idx + 2] = 42;
        phaseImgData.data[idx + 3] = 255;
      }
    }
    phaseOffCtx.putImageData(phaseImgData, 0, 0);

    // 4. Draw offscreen images scaled and panned on main canvases
    const dx = cw / 2 + pan.x - (columns * zoom) / 2;
    const dy = ch / 2 + pan.y - (rows * zoom) / 2;
    const dw = columns * zoom;
    const dh = rows * zoom;

    // Enable pixelated scale rendering (crisp pixels)
    magCtx.imageSmoothingEnabled = false;
    phaseCtx.imageSmoothingEnabled = false;

    magCtx.drawImage(magOffscreen, dx, dy, dw, dh);
    phaseCtx.drawImage(phaseOffscreen, dx, dy, dw, dh);

    // 5. Draw ROI overlays
    const drawRoiOverlay = (ctx: CanvasRenderingContext2D) => {
      ctx.lineWidth = 2;

      if (roiType === 'circle') {
        const canvasCenter = imageToCanvasCoords(
          roiCircleCenter.x,
          roiCircleCenter.y,
          cw,
          ch,
          columns,
          rows
        );
        const canvasRadius = roiCircleRadius * zoom;

        // Draw circle
        ctx.strokeStyle = 'var(--color-accent)';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
        ctx.beginPath();
        ctx.arc(canvasCenter.x, canvasCenter.y, canvasRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Draw handles if ROI tool is active
        if (activeTool === 'roi') {
          // Center handle
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(canvasCenter.x, canvasCenter.y, 5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();

          // Perimeter handle (on the right edge)
          const handlePX = canvasCenter.x + canvasRadius;
          ctx.beginPath();
          ctx.arc(handlePX, canvasCenter.y, 5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
      } else if (roiType === 'polygon') {
        if (roiPolygonPoints.length > 0) {
          ctx.strokeStyle = 'var(--color-accent)';
          ctx.fillStyle = isRoiClosed ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.05)';
          ctx.beginPath();

          const startPt = imageToCanvasCoords(
            roiPolygonPoints[0].x,
            roiPolygonPoints[0].y,
            cw,
            ch,
            columns,
            rows
          );
          ctx.moveTo(startPt.x, startPt.y);

          for (let i = 1; i < roiPolygonPoints.length; i++) {
            const pt = imageToCanvasCoords(
              roiPolygonPoints[i].x,
              roiPolygonPoints[i].y,
              cw,
              ch,
              columns,
              rows
            );
            ctx.lineTo(pt.x, pt.y);
          }

          if (isRoiClosed) {
            ctx.closePath();
            ctx.fill();
          }
          ctx.stroke();

          // Draw vertex handles
          if (activeTool === 'roi') {
            roiPolygonPoints.forEach((pt, idx) => {
              const canvasPt = imageToCanvasCoords(pt.x, pt.y, cw, ch, columns, rows);
              
              // First point is larger / highlight to close
              ctx.fillStyle = idx === 0 ? '#38bdf8' : '#ffffff';
              ctx.strokeStyle = '#020617';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(canvasPt.x, canvasPt.y, idx === 0 ? 6 : 4.5, 0, 2 * Math.PI);
              ctx.fill();
              ctx.stroke();
            });
          }
        }
      }
    };

    drawRoiOverlay(magCtx);
    drawRoiOverlay(phaseCtx);

    // Draw reference guides / grid lines in Magnitude canvas center
    magCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    magCtx.lineWidth = 1;
    magCtx.beginPath();
    magCtx.moveTo(cw / 2, 0); magCtx.lineTo(cw / 2, ch);
    magCtx.moveTo(0, ch / 2); magCtx.lineTo(cw, ch / 2);
    magCtx.stroke();
  };

  useEffect(() => {
    drawViewer();
  }, [
    magnitudeFile,
    phaseFile,
    zoom,
    pan,
    windowCenter,
    windowWidth,
    roiType,
    roiCircleCenter,
    roiCircleRadius,
    roiPolygonPoints,
    isRoiClosed,
    colormap,
    activeTool
  ]);

  // Resize observer to update canvas dimensions dynamically
  useEffect(() => {
    const magCanvas = magCanvasRef.current;
    if (!magCanvas) return;
    const parent = magCanvas.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => {
      drawViewer();
    });
    observer.observe(parent);

    return () => {
      observer.disconnect();
    };
  }, [
    magnitudeFile,
    phaseFile,
    zoom,
    pan,
    windowCenter,
    windowWidth,
    roiType,
    roiCircleCenter,
    roiCircleRadius,
    roiPolygonPoints,
    isRoiClosed,
    colormap,
    activeTool
  ]);

  // Mouse handlers for canvas interactions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!magnitudeFile) return;
    
    // Support windowing with right-click or if window tool is active
    const isRightClick = e.button === 2;

    setIsMouseDown(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });

    if (isRightClick) {
      e.preventDefault();
      setActiveTool('window');
      return;
    }

    const { columns, rows } = magnitudeFile;
    const imgPt = clientToImageCoords(
      e.clientX,
      e.clientY,
      magCanvasRef.current!,
      columns,
      rows
    );

    if (activeTool === 'roi') {
      if (roiType === 'circle') {
        // Check if clicked center or edge handle
        const distToCenter = Math.sqrt((imgPt.x - roiCircleCenter.x) ** 2 + (imgPt.y - roiCircleCenter.y) ** 2);
        const distToPerimeter = Math.abs(distToCenter - roiCircleRadius);

        // Within click tolerance (adjust based on zoom)
        const hitTolerance = 6 / zoom; 

        if (distToCenter < hitTolerance) {
          setDraggedElement('center');
        } else if (distToPerimeter < hitTolerance) {
          setDraggedElement('perimeter');
        } else {
          // Start a new circle ROI centered at click
          setRoiCircleCenter(imgPt);
          setRoiCircleRadius(2); // start small
          setDraggedElement('perimeter'); // immediately let them resize
        }
      } else if (roiType === 'polygon') {
        // If closed, check if clicking a vertex to drag
        if (isRoiClosed) {
          let clickedVertexIdx = -1;
          const hitTolerance = 6 / zoom;

          for (let i = 0; i < roiPolygonPoints.length; i++) {
            const v = roiPolygonPoints[i];
            const dist = Math.sqrt((imgPt.x - v.x) ** 2 + (imgPt.y - v.y) ** 2);
            if (dist <= hitTolerance) {
              clickedVertexIdx = i;
              break;
            }
          }

          if (clickedVertexIdx !== -1) {
            setDraggedElement(clickedVertexIdx);
          } else {
            // Clicked elsewhere, reset and start drawing new polygon
            setRoiPolygonPoints([imgPt]);
            setIsRoiClosed(false);
            setDraggedElement(null);
          }
        } else {
          // Drawing in progress
          if (roiPolygonPoints.length > 0) {
            // Check if clicking near the first point to close
            const firstPt = roiPolygonPoints[0];
            const dist = Math.sqrt((imgPt.x - firstPt.x) ** 2 + (imgPt.y - firstPt.y) ** 2);
            const closeTolerance = 8 / zoom;

            if (dist <= closeTolerance && roiPolygonPoints.length >= 3) {
              setIsRoiClosed(true);
            } else {
              // Add a vertex
              setRoiPolygonPoints([...roiPolygonPoints, imgPt]);
            }
          } else {
            // Start polygon
            setRoiPolygonPoints([imgPt]);
          }
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!magnitudeFile) return;

    const { columns, rows, pixelData: magData } = magnitudeFile;
    const phaseData = phaseFile?.pixelData;

    // 1. Hover updates
    const imgPt = clientToImageCoords(
      e.clientX,
      e.clientY,
      magCanvasRef.current!,
      columns,
      rows
    );

    // Keep hover coordinates in image space bounds
    if (imgPt.x >= 0 && imgPt.x < columns && imgPt.y >= 0 && imgPt.y < rows) {
      const idx = imgPt.y * columns + imgPt.x;
      const magVal = Math.round(magData[idx]);
      const phaseVal = phaseData ? Math.round(phaseData[idx]) : 0;
      setHoverPixel({ x: imgPt.x, y: imgPt.y, mag: magVal, phase: phaseVal });
    } else {
      setHoverPixel(null);
    }

    if (!isMouseDown) return;

    // 2. Drag/Move updates
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    setLastMousePos({ x: e.clientX, y: e.clientY });

    if (activeTool === 'pan') {
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    } else if (activeTool === 'window') {
      // Adjust contrast (WW / WC)
      // Horizontal drag -> Window Width (WW)
      // Vertical drag -> Window Center (WC)
      setWindowWidth(prev => Math.max(10, prev + dx * 2));
      setWindowCenter(prev => Math.max(0, prev - dy * 2));
    } else if (activeTool === 'roi') {
      if (roiType === 'circle' && draggedElement) {
        if (draggedElement === 'center') {
          setRoiCircleCenter(imgPt);
        } else if (draggedElement === 'perimeter') {
          const r = Math.sqrt((imgPt.x - roiCircleCenter.x) ** 2 + (imgPt.y - roiCircleCenter.y) ** 2);
          // Keep a minimum radius
          setRoiCircleRadius(Math.max(0.5, r));
        }
      } else if (roiType === 'polygon' && draggedElement !== null) {
        const idx = draggedElement as number;
        const newPts = [...roiPolygonPoints];
        newPts[idx] = imgPt;
        setRoiPolygonPoints(newPts);
      }
    }
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
    setDraggedElement(null);
    if (activeTool === 'window') {
      // Return tool back to roi or keep windowing
      // Actually keep activeTool unless right click released
    }
  };

  const handleZoomButton = (zoomIn: boolean) => {
    const factor = zoomIn ? 1.2 : 1 / 1.2;
    const oldZoom = zoom;
    const newZoom = Math.max(0.5, Math.min(25, oldZoom * factor));
    if (newZoom !== oldZoom) {
      setZoom(newZoom);
      setPan(prev => ({
        x: prev.x * (newZoom / oldZoom),
        y: prev.y * (newZoom / oldZoom)
      }));
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    // If Ctrl key (or Meta/Cmd key) is pressed, scroll to zoom
    if (e.ctrlKey || e.metaKey) {
      if (!magnitudeFile || !magCanvasRef.current) return;

      const canvas = magCanvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const cw = rect.width;
      const ch = rect.height;

      const dx = cx - cw / 2;
      const dy = cy - ch / 2;

      const zoomFactor = 1.1;
      const oldZoom = zoom;
      let newZoom = oldZoom;
      if (e.deltaY < 0) {
        newZoom = Math.min(25, oldZoom * zoomFactor);
      } else {
        newZoom = Math.max(0.5, oldZoom / zoomFactor);
      }

      if (newZoom !== oldZoom) {
        setZoom(newZoom);
        setPan(prev => ({
          x: dx - (dx - prev.x) * (newZoom / oldZoom),
          y: dy - (dy - prev.y) * (newZoom / oldZoom)
        }));
      }
      return;
    }

    // Default: wheel changes frames
    if (totalFrames <= 1) return;

    if (e.deltaY > 0) {
      onFrameChange((currentFrameIndex + 1) % totalFrames);
    } else if (e.deltaY < 0) {
      onFrameChange((currentFrameIndex - 1 + totalFrames) % totalFrames);
    }
  };

  const handleResetViewport = () => {
    if (magnitudeFile) {
      setZoom(3.5);
      setPan({ x: 0, y: 0 });
      setWindowWidth(magnitudeFile.windowWidth || 500);
      setWindowCenter(magnitudeFile.windowCenter || 300);
    }
  };

  return (
    <div className="viewer-workspace">
      {/* Tool panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className={`btn ${activeTool === 'roi' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTool('roi')}
            title="Region of Interest Tool"
          >
            {roiType === 'circle' && <Circle size={16} />}
            {roiType === 'polygon' && <Hexagon size={16} />}
            ROI Markup
          </button>
          
          <button 
            className={`btn ${activeTool === 'pan' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTool('pan')}
            title="Pan & Zoom Tool"
          >
            <Move size={16} /> Pan
          </button>
          
          <button 
            className={`btn ${activeTool === 'window' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTool('window')}
            title="Adjust Contrast (WW/WC)"
          >
            Contrast
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-icon-only" onClick={() => handleZoomButton(true)} title="Zoom In">
            <ZoomIn size={16} />
          </button>
          <button className="btn btn-secondary btn-icon-only" onClick={() => handleZoomButton(false)} title="Zoom Out">
            <ZoomOut size={16} />
          </button>
          <button className="btn btn-secondary" onClick={handleResetViewport} title="Reset Zoom, Pan & Contrast">
            <RefreshCw size={16} /> Reset
          </button>
        </div>
      </div>

      {/* Main viewers */}
      <div className="viewer-grid">
        <div className={`viewer-card ${activeTool === 'roi' ? 'active' : ''}`}>
          <div className="viewer-header">
            <span className="viewer-title">Magnitude Anatomy</span>
            {magnitudeFile && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Frame {magnitudeFile.imageNumber} ({Math.round(magnitudeFile.triggerTime)} ms)
              </span>
            )}
          </div>
          <div className="canvas-container crosshair-cursor">
            <canvas
              ref={magCanvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={handleWheel}
            />
            {magnitudeFile && (
              <div className="zoom-indicator">Zoom: {Math.round(zoom * 100)}%</div>
            )}
          </div>
        </div>

        <div className="viewer-card">
          <div className="viewer-header">
            <span className="viewer-title">Phase Contrast Flow Velocity</span>
            {phaseFile && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {colormap === 'flow' ? 'Caudal (+) / Cranial (-)' : 'Raw Grayscale'}
              </span>
            )}
          </div>
          <div className="canvas-container crosshair-cursor">
            <canvas
              ref={phaseCanvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={handleWheel}
            />
          </div>
        </div>
      </div>

      {/* Coordinate & Pixel Hover Info Bar */}
      <div className="card" style={{ display: 'flex', gap: '2rem', padding: '0.65rem 1rem', margin: '0', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', minHeight: '2.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {hoverPixel ? (
          <>
            <div>Coordinate: <span style={{ color: 'var(--color-accent)' }}>X: {hoverPixel.x}, Y: {hoverPixel.y}</span></div>
            <div>Magnitude Value: <span style={{ color: '#fff' }}>{hoverPixel.mag}</span></div>
            {phaseFile && (
              <div>
                Phase Value: <span style={{ color: 'var(--color-accent)' }}>{hoverPixel.phase}</span>
                &nbsp;|&nbsp;
                Calculated Speed: <span style={{ 
                  color: rawToVelocity(hoverPixel.phase, venc, mappingFormat, phaseFile.rescaleSlope, phaseFile.rescaleIntercept, phaseFile.isSigned) > 1 ? 'var(--color-forward)' : rawToVelocity(hoverPixel.phase, venc, mappingFormat, phaseFile.rescaleSlope, phaseFile.rescaleIntercept, phaseFile.isSigned) < -1 ? 'var(--color-backward)' : '#fff',
                  fontWeight: '600'
                }}>
                  {rawToVelocity(hoverPixel.phase, venc, mappingFormat, phaseFile.rescaleSlope, phaseFile.rescaleIntercept, phaseFile.isSigned).toFixed(2)} cm/s
                </span>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>
            Hover mouse over Magnitude or Phase Contrast image to inspect coordinates, pixel values, and flow velocities.
          </div>
        )}
      </div>
    </div>
  );
};
