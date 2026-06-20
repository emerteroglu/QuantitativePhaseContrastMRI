import dicomParser from 'dicom-parser';

export interface ParsedDicomFile {
  isSynthetic?: boolean;
  fileName: string;
  patientName: string;
  patientId: string;
  studyDate: string;
  seriesDescription: string;
  seriesNumber: number;
  imageNumber: number;
  triggerTime: number; // in ms
  rows: number;
  columns: number;
  pixelSpacingX: number; // in mm
  pixelSpacingY: number; // in mm
  venc: number | null; // cm/s (null if not detected)
  rescaleSlope: number;
  rescaleIntercept: number;
  windowCenter: number | null;
  windowWidth: number | null;
  bitsAllocated: number;
  bitsStored: number;
  pixelRepresentation: number; // 0 = unsigned, 1 = signed
  pixelData: Float32Array; // raw decoded pixel values
  isSigned: boolean;
  isPhase: boolean; // true = Phase, false = Magnitude
}

/**
 * Parses a single DICOM file (which may contain one or multiple frames) from an ArrayBuffer.
 * Returns an array of ParsedDicomFile objects representing each frame.
 */
export function parseDicomFile(arrayBuffer: ArrayBuffer, fileName: string): ParsedDicomFile[] {
  const byteArray = new Uint8Array(arrayBuffer);
  let dataSet;
  try {
    dataSet = dicomParser.parseDicom(byteArray);
  } catch (err: any) {
    const errMsg = (err.message || '').toLowerCase();
    if (errMsg.includes('signature') || errMsg.includes('dicm')) {
      // Synthesize standard Part 10 preamble (128 zeros + 'DICM')
      const synthesizedHeader = new Uint8Array(132);
      synthesizedHeader[128] = 0x44; // 'D'
      synthesizedHeader[129] = 0x49; // 'I'
      synthesizedHeader[130] = 0x43; // 'C'
      synthesizedHeader[131] = 0x4d; // 'M'
      
      const combined = new Uint8Array(synthesizedHeader.length + byteArray.length);
      combined.set(synthesizedHeader);
      combined.set(byteArray, synthesizedHeader.length);
      
      // Parse the combined array
      dataSet = dicomParser.parseDicom(combined);
    } else {
      throw err;
    }
  }


  // 1. Patient Demographics
  const patientName = dataSet.string('x00100010') || 'ANONYMOUS';
  const patientId = dataSet.string('x00100020') || 'UNKNOWN_ID';
  const studyDate = dataSet.string('x00080020') || 'UNKNOWN_DATE';

  // 2. Acquisition details
  const seriesDescription = dataSet.string('x0008103e') || 'NO_SERIES_DESC';
  const seriesNumber = parseInt(dataSet.string('x00200011') || '0', 10);
  const imageNumber = parseInt(dataSet.string('x00200013') || '0', 10);
  
  // Trigger Time (0018, 1060) is float string of milliseconds since ECG R-wave
  const triggerTimeStr = dataSet.string('x00181060');
  const triggerTime = triggerTimeStr ? parseFloat(triggerTimeStr) : 0;

  // 3. Image dimensions & spacing
  const rows = dataSet.uint16('x00280010') || 256;
  const columns = dataSet.uint16('x00280011') || 256;

  // Pixel Spacing (0028, 0030) is string "RowSpacing\ColSpacing"
  let pixelSpacingX = 1.0;
  let pixelSpacingY = 1.0;
  const spacingStr = dataSet.string('x00280030');
  if (spacingStr) {
    const spacingParts = spacingStr.split('\\');
    if (spacingParts.length >= 2) {
      pixelSpacingY = parseFloat(spacingParts[0]); // row spacing
      pixelSpacingX = parseFloat(spacingParts[1]); // col spacing
    }
  }

  // 4. Contrast & display tags
  const rescaleSlope = parseFloat(dataSet.string('x00281053') || '1.0');
  const rescaleIntercept = parseFloat(dataSet.string('x00281052') || '0.0');
  
  const windowCenterStr = dataSet.string('x00281050');
  const windowCenter = windowCenterStr ? parseFloat(windowCenterStr) : null;
  const windowWidthStr = dataSet.string('x00281051');
  const windowWidth = windowWidthStr ? parseFloat(windowWidthStr) : null;

  // 5. Bits allocated and signedness
  const bitsAllocated = dataSet.uint16('x00280100') || 16;
  const bitsStored = dataSet.uint16('x00280101') || 16;
  const pixelRepresentation = dataSet.uint16('x00280103') || 0; // 0 = unsigned, 1 = signed
  const isSigned = pixelRepresentation === 1;

  // 6. Private tags for Venc (Velocity Encoding)
  let venc: number | null = null;
  
  // Siemens (0051, 1014) is a text string like "Venc=150" or "Venc=15"
  const siemensVenc = dataSet.string('x00511014');
  if (siemensVenc && siemensVenc.includes('Venc=')) {
    const match = siemensVenc.match(/Venc=(\d+)/);
    if (match) {
      const val = parseFloat(match[1]);
      venc = val > 100 ? val / 10 : val;
    }
  }

  // Siemens private tag (0019, 1014) also sometimes stores it
  if (venc === null) {
    const siemensVencAlt = dataSet.string('x00191014');
    if (siemensVencAlt && siemensVencAlt.includes('Venc=')) {
      const match = siemensVencAlt.match(/Venc=(\d+)/);
      if (match) {
        const val = parseFloat(match[1]);
        venc = val > 100 ? val / 10 : val;
      }
    }
  }

  // Standard DICOM tag for Venc (0018, 9217) - Velocity Encoding Maximum Value (FD)
  if (venc === null) {
    const stdVencStr = dataSet.string('x00189217');
    const stdVencFloat = dataSet.float('x00189217');
    const val = stdVencStr ? parseFloat(stdVencStr) : stdVencFloat;
    if (val !== undefined && !isNaN(val) && val > 0) {
      venc = val;
    }
  }

  // GE private tag (0019, 10CC) - typically stored in mm/s (e.g. 150 for 15 cm/s)
  if (venc === null) {
    const geVenc = dataSet.uint16('x001910cc');
    if (geVenc !== undefined && geVenc > 0) {
      venc = geVenc / 10.0;
    }
  }

  // GE private tag (0043, 102F) - alternative private tag for Venc
  if (venc === null) {
    const geVencAlt = dataSet.uint16('x0043102f');
    if (geVencAlt !== undefined && geVencAlt > 0) {
      venc = geVencAlt / 10.0;
    }
  }

  // Philips private tag (2001, 101A) or standard (0018, 9114)
  if (venc === null) {
    const philipsVenc = dataSet.string('x00189114') || dataSet.string('x2001101a');
    if (philipsVenc) {
      const val = parseFloat(philipsVenc);
      if (!isNaN(val) && val > 0) {
        venc = val > 100 ? val / 10 : val;
      }
    }
  }

  // 7. Modality / Phase classification
  const desc = seriesDescription.toLowerCase();
  const isPhase = desc.includes('phase') || 
                  desc.includes('velocity') || 
                  desc.includes('flow') || 
                  desc.includes('venc') || 
                  desc.includes('_p') || 
                  desc.endsWith('p') || 
                  desc.includes(' ph ');

  // 8. Decode Pixel Data
  const pixelDataElement = dataSet.elements['x7fe00010'];
  if (!pixelDataElement) {
    throw new Error('DICOM file has no pixel data tag (7FE0,0010)');
  }

  const pixelDataBytes = new Uint8Array(
    dataSet.byteArray.buffer,
    dataSet.byteArray.byteOffset + pixelDataElement.dataOffset,
    pixelDataElement.length
  );


  // Multi-frame support tags
  const numberOfFrames = parseInt(dataSet.string('x00280008') || '1', 10);
  const frameTimeVectorStr = dataSet.string('x00181065');
  const frameTimeVector = frameTimeVectorStr ? frameTimeVectorStr.split('\\').map(Number) : [];
  const frameTime = dataSet.floatString('x00181063') || 0;

  const parsedFrames: ParsedDicomFile[] = [];
  const bytesPerPixel = bitsAllocated === 16 ? 2 : 1;
  const frameSizeInBytes = rows * columns * bytesPerPixel;

  for (let f = 0; f < numberOfFrames; f++) {
    const framePixelData = new Float32Array(rows * columns);
    const startByteOffset = f * frameSizeInBytes;

    if (bitsAllocated === 16) {
      // 16-bit pixels (2 bytes per pixel)
      const dataView = new DataView(
        pixelDataBytes.buffer, 
        pixelDataBytes.byteOffset + startByteOffset,
        Math.min(frameSizeInBytes, pixelDataBytes.byteLength - startByteOffset)
      );
      
      const numPixels = rows * columns;
      for (let i = 0; i < numPixels; i++) {
        const byteIdx = i * 2;
        if (startByteOffset + byteIdx + 1 < pixelDataBytes.length) {
          let rawVal = 0;
          if (isSigned) {
            rawVal = dataView.getInt16(byteIdx, true);
          } else {
            rawVal = dataView.getUint16(byteIdx, true);
          }
          framePixelData[i] = rawVal;
        }
      }
    } else if (bitsAllocated === 8) {
      // 8-bit pixels (1 byte per pixel)
      const numPixels = rows * columns;
      for (let i = 0; i < numPixels; i++) {
        const byteIdx = startByteOffset + i;
        if (byteIdx < pixelDataBytes.length) {
          let rawVal = 0;
          if (isSigned) {
            rawVal = (pixelDataBytes[byteIdx] << 24) >> 24;
          } else {
            rawVal = pixelDataBytes[byteIdx];
          }
          framePixelData[i] = rawVal;
        }
      }
    } else {
      throw new Error(`Unsupported BitsAllocated: ${bitsAllocated}`);
    }

    // Determine trigger time for this frame
    let frameTriggerTime = triggerTime;
    if (numberOfFrames > 1) {
      if (frameTimeVector.length > f) {
        frameTriggerTime = frameTimeVector[f];
      } else if (frameTime > 0) {
        frameTriggerTime = f * frameTime;
      } else {
        // Fallback: estimate 800ms cardiac cycle divided by frames
        frameTriggerTime = (f / numberOfFrames) * 800;
      }
    }

    parsedFrames.push({
      fileName: numberOfFrames > 1 ? `${fileName}#${f}` : fileName,
      patientName,
      patientId,
      studyDate,
      seriesDescription: numberOfFrames > 1 ? `${seriesDescription} (Phase ${f + 1})` : seriesDescription,
      seriesNumber,
      imageNumber: numberOfFrames > 1 ? f + 1 : imageNumber,
      triggerTime: frameTriggerTime,
      rows,
      columns,
      pixelSpacingX,
      pixelSpacingY,
      venc,
      rescaleSlope,
      rescaleIntercept,
      windowCenter,
      windowWidth,
      bitsAllocated,
      bitsStored,
      pixelRepresentation,
      pixelData: framePixelData,
      isSigned,
      isPhase
    });
  }

  return parsedFrames;
}


export interface GroupedDicomSeries {
  magnitude: ParsedDicomFile[];
  phase: ParsedDicomFile[];
}

/**
 * Groups an array of parsed DICOM files into Magnitude and Phase series.
 * Automatically matches frames between the two based on imageNumber/triggerTime.
 */
export function groupDicomFiles(files: ParsedDicomFile[]): GroupedDicomSeries {
  const magnitude: ParsedDicomFile[] = [];
  const phase: ParsedDicomFile[] = [];

  // 1. Split into magnitude and phase arrays
  files.forEach(file => {
    if (file.isPhase) {
      phase.push(file);
    } else {
      magnitude.push(file);
    }
  });

  // 2. Sort by Trigger Time
  magnitude.sort((a, b) => a.triggerTime - b.triggerTime);
  phase.sort((a, b) => a.triggerTime - b.triggerTime);

  // If one of the lists is empty, let's try a heuristic fallback
  // If all files are in one list, let's look at Series Numbers.
  // Standard acquisitions have separate Series Numbers for Magnitude and Phase.
  if (magnitude.length === 0 || phase.length === 0) {
    const seriesGroups: { [key: number]: ParsedDicomFile[] } = {};
    files.forEach(file => {
      if (!seriesGroups[file.seriesNumber]) {
        seriesGroups[file.seriesNumber] = [];
      }
      seriesGroups[file.seriesNumber].push(file);
    });

    const seriesKeys = Object.keys(seriesGroups).map(Number);
    if (seriesKeys.length >= 2) {
      // Find which series is phase by checking name or value variance
      const series1 = seriesGroups[seriesKeys[0]];
      const series2 = seriesGroups[seriesKeys[1]];

      const hasNegativeS1 = series1.some(f => f.pixelData.some(p => p < 0));
      const hasNegativeS2 = series2.some(f => f.pixelData.some(p => p < 0));

      let phaseSeriesKey = seriesKeys[1];
      let magSeriesKey = seriesKeys[0];

      if (hasNegativeS1 && !hasNegativeS2) {
        phaseSeriesKey = seriesKeys[0];
        magSeriesKey = seriesKeys[1];
      } else {
        // Fallback to series description names
        const desc1 = series1[0].seriesDescription.toLowerCase();

        if (desc1.includes('p') || desc1.includes('pha') || desc1.includes('flow')) {
          phaseSeriesKey = seriesKeys[0];
          magSeriesKey = seriesKeys[1];
        }
      }

      magnitude.length = 0;
      phase.length = 0;
      magnitude.push(...seriesGroups[magSeriesKey].sort((a, b) => a.triggerTime - b.triggerTime));
      phase.push(...seriesGroups[phaseSeriesKey].sort((a, b) => a.triggerTime - b.triggerTime));
    } else if (files.length >= 2 && files.length % 2 === 0) {
      // Split-half fallback: Magnitude and Phase are combined in a single flat series (e.g. 42 files)
      const N = files.length / 2;

      // Sort by image number first, then fallback to trigger time and name
      const sortedFiles = [...files].sort((a, b) => {
        if (a.imageNumber !== b.imageNumber) return a.imageNumber - b.imageNumber;
        if (a.triggerTime !== b.triggerTime) return a.triggerTime - b.triggerTime;
        return a.fileName.localeCompare(b.fileName);
      });

      const half1 = sortedFiles.slice(0, N);
      const half2 = sortedFiles.slice(N);

      // Heuristic helper to check pixel mean value
      const getAveragePixel = (f: ParsedDicomFile): number => {
        if (!f || f.pixelData.length === 0) return 0;
        let sum = 0;
        const step = Math.max(1, Math.floor(f.pixelData.length / 500)); // Sample 500 pixels
        let count = 0;
        for (let i = 0; i < f.pixelData.length; i += step) {
          sum += f.pixelData[i];
          count++;
        }
        return sum / count;
      };

      const hasNegatives1 = half1.some(f => f.pixelData.some(p => p < 0));
      const hasNegatives2 = half2.some(f => f.pixelData.some(p => p < 0));

      const avg1 = half1[0] ? getAveragePixel(half1[0]) : 0;
      const avg2 = half2[0] ? getAveragePixel(half2[0]) : 0;

      // Unsigned Phase maps zero velocity to ~2048, yielding high overall mean compared to T2 magnitude
      const isUnsignedPhase1 = avg1 > 1500 && avg1 < 2500;
      const isUnsignedPhase2 = avg2 > 1500 && avg2 < 2500;

      let magList = half1;
      let phaseList = half2;

      if ((hasNegatives1 || isUnsignedPhase1) && !(hasNegatives2 || isUnsignedPhase2)) {
        phaseList = half1;
        magList = half2;
      } else if (!(hasNegatives1 || isUnsignedPhase1) && (hasNegatives2 || isUnsignedPhase2)) {
        magList = half1;
        phaseList = half2;
      } else {
        // Default: Magnitude is first half, Phase is second half
        magList = half1;
        phaseList = half2;
      }

      // Sort and align
      magnitude.length = 0;
      phase.length = 0;
      magnitude.push(...magList.sort((a, b) => a.triggerTime - b.triggerTime));
      phase.push(...phaseList.sort((a, b) => a.triggerTime - b.triggerTime));

      // Standardize metadata links & force phase classification
      for (let i = 0; i < N; i++) {
        if (magnitude[i] && phase[i]) {
          phase[i].triggerTime = magnitude[i].triggerTime;
          phase[i].isPhase = true;
          magnitude[i].isPhase = false;
        }
      }
    }
  }

  return { magnitude, phase };
}
