import React, { useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

interface ControlBarProps {
  currentFrameIndex: number;
  totalFrames: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onFrameChange: (idx: number) => void;
  fps: number;
  setFps: (fps: number) => void;
  triggerTime: number;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  currentFrameIndex,
  totalFrames,
  isPlaying,
  onPlayPause,
  onFrameChange,
  fps,
  setFps,
  triggerTime
}) => {
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying && totalFrames > 0) {
      const intervalMs = 1000 / fps;
      playIntervalRef.current = setInterval(() => {
        onFrameChange((currentFrameIndex + 1) % totalFrames);
      }, intervalMs);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, currentFrameIndex, totalFrames, fps]);

  const handlePrevFrame = () => {
    if (totalFrames === 0) return;
    onFrameChange((currentFrameIndex - 1 + totalFrames) % totalFrames);
  };

  const handleNextFrame = () => {
    if (totalFrames === 0) return;
    onFrameChange((currentFrameIndex + 1) % totalFrames);
  };

  return (
    <div className="control-bar">
      <div className="playback-controls">
        <button
          className="btn btn-secondary btn-icon-only"
          onClick={handlePrevFrame}
          disabled={totalFrames <= 1}
          title="Previous Frame"
        >
          <SkipBack size={16} />
        </button>

        <button
          className={`btn btn-icon-only ${isPlaying ? 'btn-accent' : 'btn-primary'}`}
          onClick={onPlayPause}
          disabled={totalFrames <= 1}
          title={isPlaying ? 'Pause Cine Loop' : 'Play Cine Loop'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <button
          className="btn btn-secondary btn-icon-only"
          onClick={handleNextFrame}
          disabled={totalFrames <= 1}
          title="Next Frame"
        >
          <SkipForward size={16} />
        </button>
      </div>

      <div className="timeline-slider-container">
        <span className="frame-badge">
          Frame {totalFrames > 0 ? currentFrameIndex + 1 : 0} / {totalFrames}
        </span>

        <input
          type="range"
          className="range-slider"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={currentFrameIndex}
          onChange={(e) => onFrameChange(parseInt(e.target.value, 10))}
          disabled={totalFrames <= 1}
        />

        <span className="frame-badge" style={{ minWidth: '90px' }}>
          {triggerTime.toFixed(0)} ms
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '180px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          Speed: {fps} FPS
        </span>
        <input
          type="range"
          className="range-slider"
          min={1}
          max={30}
          value={fps}
          onChange={(e) => setFps(parseInt(e.target.value, 10))}
          disabled={totalFrames <= 1}
        />
      </div>
    </div>
  );
};
