export interface Point {
  x: number;
  y: number;
}

/**
 * Performs region growing segmentation on a magnitude image starting from a seed point.
 * Includes a maximum distance guard to prevent leakage.
 */
export function regionGrow(
  pixels: Float32Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerance: number,
  maxRadius: number = 12
): boolean[] {
  const mask = new Array(width * height).fill(false);
  
  // Boundary check
  if (seedX < 0 || seedX >= width || seedY < 0 || seedY >= height) {
    return mask;
  }

  const seedIndex = seedY * width + seedX;
  const seedValue = pixels[seedIndex];
  
  const queue: Point[] = [{ x: seedX, y: seedY }];
  mask[seedIndex] = true;
  
  const dx = [0, 0, -1, 1];
  const dy = [-1, 1, 0, 0];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    
    for (let i = 0; i < 4; i++) {
      const nx = curr.x + dx[i];
      const ny = curr.y + dy[i];
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        
        if (!mask[nIdx]) {
          // Check distance from seed (guard against leakage)
          const dist = Math.sqrt((nx - seedX) ** 2 + (ny - seedY) ** 2);
          if (dist > maxRadius) continue;

          const val = pixels[nIdx];
          
          // Region growing criteria: value is close to the seed value
          // Since aqueduct is bright CSF, we also check if it is above a certain intensity
          // relative to the background, but generally seedValue +/- tolerance is robust.
          const diff = Math.abs(val - seedValue);
          if (diff <= tolerance) {
            mask[nIdx] = true;
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
  }

  return mask;
}

/**
 * Traces the boundary of a binary mask and returns an ordered list of points.
 * Uses Moore-Neighbor tracing.
 */
export function traceContour(mask: boolean[], width: number, height: number): Point[] {
  // Find the first pixel in the mask (scanning top-to-bottom, left-to-right)
  let startX = -1;
  let startY = -1;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        startX = x;
        startY = y;
        break;
      }
    }
    if (startX !== -1) break;
  }

  if (startX === -1) return [];

  const boundary: Point[] = [];
  
  // Directions: 0=Up, 1=Up-Right, 2=Right, 3=Down-Right, 4=Down, 5=Down-Left, 6=Left, 7=Up-Left
  const dirX = [0, 1, 1, 1, 0, -1, -1, -1];
  const dirY = [-1, -1, 0, 1, 1, 1, 0, -1];

  let currX = startX;
  let currY = startY;
  let prevX = startX;
  let prevY = startY - 1; // Start checking from the pixel above
  
  let entered = false;
  let backtrackCount = 0;

  // Max iterations to prevent infinite loop on complex shapes
  const maxIterations = 500;
  
  while ((currX !== startX || currY !== startY || !entered) && backtrackCount < maxIterations) {
    entered = true;
    backtrackCount++;

    boundary.push({ x: currX, y: currY });

    // Determine the direction we came from
    let incomingDir = 0;
    for (let d = 0; d < 8; d++) {
      if (currX + dirX[d] === prevX && currY + dirY[d] === prevY) {
        incomingDir = d;
        break;
      }
    }

    // Scan clockwise starting from the next direction
    let foundNext = false;
    for (let i = 1; i <= 8; i++) {
      const checkDir = (incomingDir + i) % 8;
      const nx = currX + dirX[checkDir];
      const ny = currY + dirY[checkDir];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (mask[ny * width + nx]) {
          prevX = currX;
          prevY = currY;
          currX = nx;
          currY = ny;
          foundNext = true;
          break;
        }
      }
    }

    if (!foundNext) {
      // Isolated pixel
      break;
    }
  }

  // Simplify the boundary points to reduce density for manual adjustment handles
  // We keep every N-th point or use a basic distance thresholding
  return simplifyPoints(boundary, 1.5);
}

/**
 * Simplifies a path of points using a simple distance-based threshold.
 */
function simplifyPoints(points: Point[], tolerance: number): Point[] {
  if (points.length <= 4) return points;

  const result: Point[] = [points[0]];
  let lastSaved = points[0];

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = p.x - lastSaved.x;
    const dy = p.y - lastSaved.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist >= tolerance) {
      result.push(p);
      lastSaved = p;
    }
  }
  
  // Always include the last point to close it neatly
  result.push(points[points.length - 1]);
  return result;
}
