// Pure functions with no browser APIs
// can be imported from Node test environments too

import { INPUT_SIZE, PLATE_W, PLATE_H } from "../config";
export { INPUT_SIZE, PLATE_W, PLATE_H };

const MASK_THRESHOLD = 0.5;

export function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

// Morphological dilation:
// any pixel within r of a set pixel becomes set
export function dilate(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let found = false;
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) found = true;
        }
      }
      out[y * w + x] = found ? 1 : 0;
    }
  }
  return out;
}

// Morphological erosion:
// a pixel stays set only if all pixels within r are also set
export function erode(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = true;
      for (let dy = -r; dy <= r && all; dy++) {
        for (let dx = -r; dx <= r && all; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) all = false;
        }
      }
      out[y * w + x] = all ? 1 : 0;
    }
  }
  return out;
}

// Morphological closing - cleans up the plate mask
// removes outlier segment elements
export function morphClose(mask, w, h, r = 2) {
  return erode(dilate(mask, w, h, r), w, h, r);
}

// Returns the bounding box of a binary mask as 4 corners [TL, TR, BR, BL]
// min/max extents - simpler and stable since the mask is already a tight fit
export function maskBbox(mask, w, h, scaleX, scaleY) {
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX > maxX) return null;
  return [
    [minX * scaleX, minY * scaleY],
    [maxX * scaleX, minY * scaleY],
    [maxX * scaleX, maxY * scaleY],
    [minX * scaleX, maxY * scaleY],
  ];
}

// Solves Ax=b via Gaussian elimination with partial pivoting
export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-10) return null;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col] / pivot;
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Computes the 3x3 perspective transform H mapping src[i] to dst[i]
// Uses the Direct Linear Transform (DLT): 8 equations, 8 unknowns
// Returns H as a flat 9-element array (row-major), with H[8]=1
export function getPerspectiveTransform(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i], [dx, dy] = dst[i];
    A.push([sx, sy, 1,  0,  0, 0, -sx*dx, -sy*dx]);
    A.push([ 0,  0, 0, sx, sy, 1, -sx*dy, -sy*dy]);
    b.push(dx, dy);
  }
  const h = solveLinear(A, b);
  return h ? [...h, 1] : null;
}

// IoU between two axis-aligned boxes in model input space
function bboxIou(a, b) {
  const ix1 = Math.max(a.bx1, b.bx1), iy1 = Math.max(a.by1, b.by1);
  const ix2 = Math.min(a.bx2, b.bx2), iy2 = Math.min(a.by2, b.by2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const aArea = (a.bx2 - a.bx1) * (a.by2 - a.by1);
  const bArea = (b.bx2 - b.bx1) * (b.by2 - b.by1);
  return inter / (aArea + bArea - inter + 1e-6);
}

// Reconstructs the segmentation mask for one detection and returns its corners
function reconstructCorners(pred, proto, idx, numDets, protoH, protoW, origW, origH, bx1, by1, bx2, by2) {
  const protoPixels = protoH * protoW;
  const pxScale = protoW / INPUT_SIZE;
  const pyScale = protoH / INPUT_SIZE;
  const px1 = Math.max(0, Math.floor(bx1 * pxScale));
  const py1 = Math.max(0, Math.floor(by1 * pyScale));
  const px2 = Math.min(protoW - 1, Math.ceil(bx2 * pxScale));
  const py2 = Math.min(protoH - 1, Math.ceil(by2 * pyScale));

  const binary = new Uint8Array(protoPixels);
  for (let py = py1; py <= py2; py++) {
    for (let px = px1; px <= px2; px++) {
      let sum = 0;
      for (let k = 0; k < 32; k++) {
        sum += pred[(5 + k) * numDets + idx] * proto[k * protoPixels + py * protoW + px];
      }
      binary[py * protoW + px] = sigmoid(sum) > MASK_THRESHOLD ? 1 : 0;
    }
  }

  const closed   = morphClose(binary, protoW, protoH, 2);
  const expanded = dilate(closed, protoW, protoH, 1);
  return maskBbox(expanded, protoW, protoH, origW / protoW, origH / protoH);
}

/**
 * Extracts ALL plate detections from raw YOLOv8-seg ONNX output tensors.
 * Applies confidence threshold + NMS, then reconstructs the segmentation mask
 * for each surviving detection.
 *
 * @param {Float32Array} pred         - output0 data, row-major [37 x numDets]
 *                                      rows 0-3: cx/cy/w/h, row 4: conf, rows 5-36: mask coeffs
 * @param {Float32Array} proto        - output1 data [32 x protoH x protoW]
 * @param {number}       numDets      - number of candidate detections
 * @param {number}       protoH       - prototype mask height (typically 104)
 * @param {number}       protoW       - prototype mask width
 * @param {number}       origW        - original image width
 * @param {number}       origH        - original image height
 * @param {number}       threshold    - confidence threshold (default 0.4)
 * @param {number}       nmsThreshold - IoU threshold for NMS (default 0.45)
 *
 * @returns {Array<{ corners, confidence, bbox }>} sorted by confidence descending
 *   corners: [[tlX,tlY],[trX,trY],[brX,brY],[blX,blY]] in origW x origH pixel space
 *   bbox:    { x1, y1, x2, y2 } in origW x origH pixel space
 */
export function extractAllDetections(pred, proto, numDets, protoH, protoW, origW, origH, threshold = 0.4, nmsThreshold = 0.45) {
  const candidates = [];
  for (let i = 0; i < numDets; i++) {
    const conf = pred[4 * numDets + i];
    if (conf < threshold) continue;
    const cx = pred[0 * numDets + i];
    const cy = pred[1 * numDets + i];
    const bw = pred[2 * numDets + i];
    const bh = pred[3 * numDets + i];
    candidates.push({ idx: i, conf, bx1: cx - bw/2, by1: cy - bh/2, bx2: cx + bw/2, by2: cy + bh/2 });
  }
  if (candidates.length === 0) return [];

  // Sort by confidence descending for greedy NMS
  candidates.sort((a, b) => b.conf - a.conf);

  // Greedy NMS: suppress boxes that overlap too much with a higher-confidence one
  const kept = [];
  const suppressed = new Uint8Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    if (suppressed[i]) continue;
    kept.push(candidates[i]);
    for (let j = i + 1; j < candidates.length; j++) {
      if (!suppressed[j] && bboxIou(candidates[i], candidates[j]) > nmsThreshold) {
        suppressed[j] = 1;
      }
    }
  }

  // Reconstruct mask + corners only for survivors
  const sx = origW / INPUT_SIZE;
  const sy = origH / INPUT_SIZE;

  return kept.map(({ idx, conf, bx1, by1, bx2, by2 }) => ({
    confidence: conf,
    bbox: { x1: bx1 * sx, y1: by1 * sy, x2: bx2 * sx, y2: by2 * sy },
    corners: reconstructCorners(pred, proto, idx, numDets, protoH, protoW, origW, origH, bx1, by1, bx2, by2),
  }));
}

// Returns the single best detection
// or null if nothing passes the threshold
export function extractDetection(pred, proto, numDets, protoH, protoW, origW, origH, threshold = 0.4) {
  return extractAllDetections(pred, proto, numDets, protoH, protoW, origW, origH, threshold)[0] ?? null;
}
