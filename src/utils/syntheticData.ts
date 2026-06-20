export interface PCFrame {
  frameIndex: number;
  triggerTime: number; // in ms
  magnitudePixels: Float32Array;
  phasePixels: Float32Array; // raw phase values
  rows: number;
  columns: number;
  pixelSpacingX: number; // in mm
  pixelSpacingY: number; // in mm
  venc: number; // in cm/s
  patientName: string;
  patientId: string;
  studyDate: string;
  seriesDescription: string;
  isSynthetic: boolean;
}

/**
 * Generates a synthetic dataset simulating a cardiac-gated Phase Contrast MRI scan
 * of the aqueduct of Sylvius.
 * Returns 24 frames representing one complete cardiac cycle.
 */
export function generateSyntheticDicomData(): PCFrame[] {
  const numFrames = 24;
  const rows = 128; // 128x128 is fast to generate/render and standard for PC-MRI
  const columns = 128;
  const pixelSpacing = 0.6; // 0.6 mm per pixel
  const venc = 15.0; // Venc of 15 cm/s is standard for aqueduct flow
  const cardiacCycleMs = 800; // 75 bpm -> 800ms cycle

  const frames: PCFrame[] = [];

  // Midbrain parameters (Mickey Mouse shape centered in the image)
  const centerX = 64;
  const centerY = 68;
  
  // Aqueduct parameters (located near the center of the midbrain)
  const aqX = centerX;
  const aqY = centerY - 6; // slightly anterior/superior in sagittal but here center-ish
  const aqRadius = 4.2; // radius in pixels (~2.5 mm radius, 5mm diameter)

  // Generate noise helper
  const boxMullerNoise = (mean = 0, std = 1) => {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * std;
  };

  for (let f = 0; f < numFrames; f++) {
    const triggerTime = Math.round((f / numFrames) * cardiacCycleMs);
    const magnitudePixels = new Float32Array(rows * columns);
    const phasePixels = new Float32Array(rows * columns);

    // CSF velocity profile over cardiac cycle: biphasic flow
    // Systole (forward/caudal flow, positive): sharp upward peak
    // Diastole (backward/cranial flow, negative): broader downward peak
    const phaseAngle = (f / numFrames) * 2.0 * Math.PI;
    
    // Formulate a velocity curve with a sharp systole and slower diastole
    // V(t) = 11.0 * sin(t) + 4.5 * sin(2t - 0.8)
    const baseVelocity = 8.5 * Math.sin(phaseAngle) + 3.8 * Math.sin(2.0 * phaseAngle - 0.5);
    
    // We scale it so peak systolic velocity is around 12.5 cm/s, diastolic peak is -6 cm/s
    const currentPeakVelocity = baseVelocity;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const idx = r * columns + c;
        
        // Calculate distance from center for anatomy
        const dx = c - centerX;
        const dy = r - centerY;
        const distToCenter = Math.sqrt(dx*dx + dy*dy);

        // Distance from aqueduct center
        const daqX = c - aqX;
        const daqY = r - aqY;
        const distToAq = Math.sqrt(daqX*daqX + daqY*daqY);

        // 1. Generate Magnitude (Anatomy) Image
        let magVal = 20; // dark background air / bone

        // Cerebellum (posterior)
        if (dy > 15 && Math.abs(dx) < 40 && distToCenter < 55) {
          magVal = 140 + boxMullerNoise(0, 10);
        }
        
        // Temporal/Occipital lobes
        if (dy < 15 && Math.abs(dx) > 20 && distToCenter < 55) {
          magVal = 160 + boxMullerNoise(0, 8);
        }

        // Midbrain (Mickey mouse shape)
        // Two peduncles (ears) and posterior tegmentum (body)
        const leftEarDist = Math.sqrt((c - (centerX - 16))**2 + (r - (centerY - 12))**2);
        const rightEarDist = Math.sqrt((c - (centerX + 16))**2 + (r - (centerY - 12))**2);
        const tegmentumDist = Math.sqrt((c - centerX)**2 + (r - (centerY + 6))**2);
        
        if (leftEarDist < 18 || rightEarDist < 18 || tegmentumDist < 22) {
          // Brain parenchyma
          magVal = 200 + boxMullerNoise(0, 12);
        }

        // Ambient cisterns / CSF space around midbrain (dark/medium grey or bright depending on contrast, let's make it darker/medium)
        if (distToCenter >= 45 && distToCenter < 50) {
          magVal = 90 + boxMullerNoise(0, 5);
        }

        // Aqueduct of Sylvius (filled with bright CSF on Magnitude)
        if (distToAq <= aqRadius) {
          // Bright CSF center with partial volume transition at edge
          const ratio = distToAq / aqRadius;
          const factor = ratio < 0.8 ? 1.0 : (1.0 - ratio) / 0.2;
          magVal = magVal * (1 - factor) + 380 * factor + boxMullerNoise(0, 15);
        } else {
          // General background noise
          magVal += boxMullerNoise(0, 3);
        }

        // Clamp Magnitude
        magnitudePixels[idx] = Math.max(0, Math.min(1000, magVal));

        // 2. Generate Phase Image
        // Static tissue has phase values centered around 0 (no flow) with some scanner phase noise
        let phaseVal = boxMullerNoise(0, 150); // raw integer range, typically Siemens stores phase as -4096 to 4095

        if (distToAq <= aqRadius) {
          // Flow inside the aqueduct (laminar parabolic profile)
          // v(r) = Vpeak * (1 - (r/R)^2)
          const rRatio = distToAq / aqRadius;
          const localVelocity = currentPeakVelocity * (1.0 - rRatio * rRatio);

          // Convert velocity to raw phase pixel value
          // Siemens signed 12-bit / 16-bit mapping: -Venc to +Venc maps to -4096 to 4095
          // PV = (Velocity / Venc) * 4096
          const basePhaseVal = (localVelocity / venc) * 4096;
          
          // Add typical flow noise (lower noise in high flow, some eddy current offset)
          phaseVal = basePhaseVal + boxMullerNoise(20, 100);
        } else if (magVal > 50) {
          // Static tissue has very low phase noise compared to air
          phaseVal = boxMullerNoise(-10, 80);
        }

        // Clamp Phase to typical 16-bit range [-4096, 4095]
        phasePixels[idx] = Math.max(-4096, Math.min(4095, phaseVal));
      }
    }

    frames.push({
      frameIndex: f,
      triggerTime,
      magnitudePixels,
      phasePixels,
      rows,
      columns,
      pixelSpacingX: pixelSpacing,
      pixelSpacingY: pixelSpacing,
      venc,
      patientName: "DEMO^CSF_FLOW",
      patientId: "DEMO-12345",
      studyDate: "20260621",
      seriesDescription: "CINE_PC_CSF_FLOW",
      isSynthetic: true
    });
  }

  return frames;
}
