export type PixelMappingFormat = 'signed16' | 'unsigned12' | 'signed12' | 'rescale' | 'auto';

export interface FrameMetrics {
  frameIndex: number;
  triggerTime: number; // ms
  areaMm2: number;
  meanVelocity: number; // cm/s
  peakSystolicVelocity: number; // cm/s (maximum positive velocity)
  peakDiastolicVelocity: number; // cm/s (maximum negative velocity, i.e. most negative)
  flowRate: number; // ml/s (total net flow rate)
  forwardFlowRate: number; // ml/s (sum of positive velocities)
  backwardFlowRate: number; // ml/s (sum of negative velocities)
}

export interface CycleSummary {
  forwardStrokeVolumeMl: number;
  forwardStrokeVolumeUl: number;
  backwardStrokeVolumeMl: number;
  backwardStrokeVolumeUl: number;
  netStrokeVolumeMl: number;
  netStrokeVolumeUl: number;
  strokeVolumeMl: number;
  strokeVolumeUl: number;
  strokeVolumePerSecMl: number;
  strokeVolumePerSecUl: number;
  regurgitantFractionPercent: number;
  peakVelocityCms: number; // maximum absolute velocity seen
  peakSystolicVelocityCms: number; // max positive velocity
  peakDiastolicVelocityCms: number; // max negative velocity
  meanFlowRateMlSec: number;
  meanFlowRateMlMin: number;
  averageAreaMm2: number;
  cardiacCycleMs: number;
  heartRateBpm: number;
}

/**
 * Converts a raw phase pixel value to velocity in cm/s.
 */
export function rawToVelocity(
  rawVal: number,
  venc: number,
  format: PixelMappingFormat,
  rescaleSlope: number = 1.0,
  rescaleIntercept: number = 0.0,
  isSigned: boolean = true
): number {
  if (format === 'rescale' || (format === 'auto' && (rescaleSlope !== 1.0 || rescaleIntercept !== 0.0))) {
    let val = rawVal * rescaleSlope + rescaleIntercept;
    
    // Detect if rescaled output is in mm/s instead of cm/s.
    // If the intercept is close to 10x the Venc, or if the max absolute value of intercept is > 40
    // while Venc is small (e.g. CSF Venc is typically 10-30 cm/s), the scale is mm/s.
    const isMmSec = Math.abs(rescaleIntercept) > venc * 3.0 || Math.abs(rescaleIntercept) > 40.0;
    if (isMmSec) {
      val = val / 10.0;
    }
    return val;
  }

  if (format === 'unsigned12') {
    // 0 to 4095 range, with 2048 representing zero velocity
    return ((rawVal - 2048) / 2048) * venc;
  }

  if (format === 'signed12') {
    // -2048 to 2047 range
    return (rawVal / 2048) * venc;
  }

  if (format === 'signed16') {
    // -32768 to 32767, but Siemens often uses -4096 to 4095
    // Let's use 4096 as standard if the value falls in the range, or check value bounds.
    // If the value exceeds 4096, it might be standard 16-bit range (32768)
    const absVal = Math.abs(rawVal);
    const limit = absVal > 4096 ? 32768 : 4096;
    return (rawVal / limit) * venc;
  }

  // 'auto' mode fallback (if rescale tags are 1.0 / 0.0)
  if (isSigned) {
    const limit = Math.abs(rawVal) > 4096 ? 32768 : 4096;
    return (rawVal / limit) * venc;
  } else {
    // Assume 12-bit unsigned [0, 4095]
    return ((rawVal - 2048) / 2048) * venc;
  }
}

/**
 * Computes flow metrics for a single frame.
 * @param roiMask Boolean array where true indicates the pixel is in the ROI
 * @param phasePixels Array of raw phase pixel values
 * @param magnitudePixels Array of magnitude pixel values (to determine voxel counts)
 * @param width Image width
 * @param height Image height
 * @param pixelSpacingX Size of pixel in X dimension (mm)
 * @param pixelSpacingY Size of pixel in Y dimension (mm)
 * @param venc Velocity encoding value (cm/s)
 * @param format Pixel mapping format
 * @param rescaleSlope DICOM rescale slope tag
 * @param rescaleIntercept DICOM rescale intercept tag
 * @param isSigned DICOM signed representation tag
 * @param frameIndex Frame sequence index
 * @param triggerTime Frame trigger time (ms)
 */
export function calculateFrameMetrics(
  roiMask: boolean[],
  phasePixels: Float32Array,
  width: number,
  height: number,
  pixelSpacingX: number,
  pixelSpacingY: number,
  venc: number,
  format: PixelMappingFormat,
  rescaleSlope: number = 1.0,
  rescaleIntercept: number = 0.0,
  isSigned: boolean = true,
  frameIndex: number,
  triggerTime: number
): FrameMetrics {
  let pixelCount = 0;
  let velocitySum = 0;
  let peakSystolic = 0; // max positive velocity
  let peakDiastolic = 0; // max negative (most negative) velocity
  
  let forwardFlowRate = 0; // ml/s
  let backwardFlowRate = 0; // ml/s

  // Pixel area in cm^2
  const pixelAreaCm2 = (pixelSpacingX * pixelSpacingY) / 100.0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (roiMask[idx]) {
        pixelCount++;
        const rawPhase = phasePixels[idx];
        const vel = rawToVelocity(rawPhase, venc, format, rescaleSlope, rescaleIntercept, isSigned);
        
        velocitySum += vel;

        if (vel > peakSystolic) {
          peakSystolic = vel;
        }
        if (vel < peakDiastolic) {
          peakDiastolic = vel;
        }

        // Flow rate of this pixel in ml/s: velocity (cm/s) * area (cm^2)
        const pixelFlow = vel * pixelAreaCm2;
        if (vel > 0) {
          forwardFlowRate += pixelFlow;
        } else {
          backwardFlowRate += pixelFlow; // negative value
        }
      }
    }
  }

  const areaMm2 = pixelCount * pixelSpacingX * pixelSpacingY;
  const meanVelocity = pixelCount > 0 ? velocitySum / pixelCount : 0;
  const flowRate = forwardFlowRate + backwardFlowRate; // net flow rate

  return {
    frameIndex,
    triggerTime,
    areaMm2,
    meanVelocity,
    peakSystolicVelocity: peakSystolic,
    peakDiastolicVelocity: peakDiastolic,
    flowRate,
    forwardFlowRate,
    backwardFlowRate
  };
}

/**
 * Computes cardiac cycle parameters by integrating frame metrics.
 */
export function calculateCycleSummary(
  frames: FrameMetrics[],
  totalCycleTimeOverrideMs?: number
): CycleSummary {
  if (frames.length === 0) {
    return {
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
      cardiacCycleMs: 0,
      heartRateBpm: 0
    };
  }

  // Sort frames by trigger time
  const sortedFrames = [...frames].sort((a, b) => a.triggerTime - b.triggerTime);
  const n = sortedFrames.length;

  // Determine cardiac cycle duration
  let cardiacCycleMs = totalCycleTimeOverrideMs || 0;
  if (cardiacCycleMs <= 0) {
    // If not overridden, estimate based on frames
    if (n > 1) {
      const avgInterval = (sortedFrames[n - 1].triggerTime - sortedFrames[0].triggerTime) / (n - 1);
      cardiacCycleMs = sortedFrames[n - 1].triggerTime + avgInterval;
    } else {
      cardiacCycleMs = 800; // default 75 bpm
    }
  }

  const heartRateBpm = Math.round(60000 / cardiacCycleMs);

  let forwardStrokeVolume = 0; // ml
  let backwardStrokeVolume = 0; // ml (stored positive for integrated volume)
  let netStrokeVolume = 0; // ml
  let velocityMaxAbsolute = 0;
  let peakSystolicMax = 0;
  let peakDiastolicMax = 0;
  let areaSum = 0;
  let flowRateSum = 0;

  // Integrate flow rate over the cardiac cycle using the trapezoidal rule
  for (let i = 0; i < n; i++) {
    const curr = sortedFrames[i];
    const next = sortedFrames[(i + 1) % n];

    // Calculate time step in seconds
    let dt = 0;
    if (i < n - 1) {
      dt = (next.triggerTime - curr.triggerTime) / 1000.0;
    } else {
      // Last frame to first frame
      dt = (cardiacCycleMs - curr.triggerTime + sortedFrames[0].triggerTime) / 1000.0;
    }
    
    // Safety check for negative/zero time intervals
    if (dt <= 0) {
      dt = (cardiacCycleMs / n) / 1000.0;
    }

    // Trapezoidal rule integration: Integral = Sum( (f(x) + f(x+dt))/2 * dt )
    // Total net flow
    netStrokeVolume += ((curr.flowRate + next.flowRate) / 2.0) * dt;

    // Forward flow (integrate positive flow rates)
    forwardStrokeVolume += ((curr.forwardFlowRate + next.forwardFlowRate) / 2.0) * dt;

    // Backward flow (integrate negative flow rates, take absolute value for volume)
    backwardStrokeVolume += (Math.abs(curr.backwardFlowRate + next.backwardFlowRate) / 2.0) * dt;

    // Accumulate other metrics
    areaSum += curr.areaMm2;
    flowRateSum += curr.flowRate;

    // Track peak velocities
    const absMean = Math.abs(curr.meanVelocity);
    const absPeakSys = Math.abs(curr.peakSystolicVelocity);
    const absPeakDia = Math.abs(curr.peakDiastolicVelocity);
    const framePeak = Math.max(absMean, absPeakSys, absPeakDia);
    
    if (framePeak > velocityMaxAbsolute) {
      velocityMaxAbsolute = framePeak;
    }
    if (curr.peakSystolicVelocity > peakSystolicMax) {
      peakSystolicMax = curr.peakSystolicVelocity;
    }
    if (curr.peakDiastolicVelocity < peakDiastolicMax) {
      peakDiastolicMax = curr.peakDiastolicVelocity;
    }
  }

  const averageAreaMm2 = areaSum / n;
  const meanFlowRateMlSec = flowRateSum / n;
  const meanFlowRateMlMin = meanFlowRateMlSec * 60.0;

  // Stroke Volume per beat: (Abs(Forward) + Abs(Backward)) / 2
  const strokeVolumeMl = (Math.abs(forwardStrokeVolume) + Math.abs(backwardStrokeVolume)) / 2.0;
  const strokeVolumeUl = strokeVolumeMl * 1000.0;

  // Stroke Volume per second
  const cycleSeconds = cardiacCycleMs / 1000.0;
  const strokeVolumePerSecMl = cycleSeconds > 0 ? strokeVolumeMl / cycleSeconds : 0;
  const strokeVolumePerSecUl = strokeVolumePerSecMl * 1000.0;

  // Regurgitant Fraction: Backward stroke volume / Forward stroke volume * 100%
  // Usually backward stroke volume is representing regurgitation if caudal is forward
  const regurgitantFractionPercent = forwardStrokeVolume > 0 
    ? (backwardStrokeVolume / forwardStrokeVolume) * 100.0 
    : 0.0;

  return {
    forwardStrokeVolumeMl: forwardStrokeVolume,
    forwardStrokeVolumeUl: forwardStrokeVolume * 1000.0,
    backwardStrokeVolumeMl: backwardStrokeVolume,
    backwardStrokeVolumeUl: backwardStrokeVolume * 1000.0,
    netStrokeVolumeMl: netStrokeVolume,
    netStrokeVolumeUl: netStrokeVolume * 1000.0,
    strokeVolumeMl,
    strokeVolumeUl,
    strokeVolumePerSecMl,
    strokeVolumePerSecUl,
    regurgitantFractionPercent,
    peakVelocityCms: velocityMaxAbsolute,
    peakSystolicVelocityCms: peakSystolicMax,
    peakDiastolicVelocityCms: peakDiastolicMax,
    meanFlowRateMlSec,
    meanFlowRateMlMin,
    averageAreaMm2,
    cardiacCycleMs,
    heartRateBpm
  };
}
