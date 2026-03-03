import * as ort from "onnxruntime-web";
import { getModel } from "./modelRegistry";
import { DETECTION_THRESHOLD } from "../config";

// Model was trained at 416x416 (must be a multiple of 32 for YOLO stride)
const INPUT_SIZE = 416;

const MASK_THRESHOLD = 0.5;

// Plate output canvas size for perspective warp (European plate aspect ~4:1)
const PLATE_W = 280;
const PLATE_H = 70;

function preprocess(canvas) {
  const tmp = document.createElement("canvas");
  tmp.width = INPUT_SIZE;
  tmp.height = INPUT_SIZE;
  tmp.getContext("2d").drawImage(canvas, 0, 0, INPUT_SIZE, INPUT_SIZE);

  const { data } = tmp.getContext("2d").getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < plane; i++) {
    tensor[i]           = data[i * 4]     / 255;
    tensor[plane + i]   = data[i * 4 + 1] / 255;
    tensor[2 * plane+i] = data[i * 4 + 2] / 255;
  }
  return tensor;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

// Morphological dilation: any pixel within r of a set pixel becomes set.
function dilate(mask, w, h, r) {
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

// Morphological erosion: a pixel stays set only if all pixels within r are also set.
function erode(mask, w, h, r) {
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

// Morphological closing (dilate then erode): fills holes and joins broken regions.
// Ngo et al. (Applied Sciences, 2023) use this step to clean thresholded plate masks.
function morphClose(mask, w, h, r = 2) {
  return erode(dilate(mask, w, h, r), w, h, r);
}

// Find 4 extreme corners of a binary mask using the diagonal sum/difference trick:
//   TL = pixel with min(x+y), TR = max(x-y), BR = max(x+y), BL = min(x-y)
// This handles rotated plates without needing a full contour algorithm.
function maskCorners(mask, w, h, scaleX, scaleY) {
  let tlMin = Infinity, trMax = -Infinity, brMax = -Infinity, blMin = Infinity;
  let tl = null, tr = null, br = null, bl = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const s = x + y, d = x - y;
      if (s < tlMin) { tlMin = s; tl = [x, y]; }
      if (d > trMax) { trMax = d; tr = [x, y]; }
      if (s > brMax) { brMax = s; br = [x, y]; }
      if (d < blMin) { blMin = d; bl = [x, y]; }
    }
  }
  if (!tl) return null;
  return [tl, tr, br, bl].map(([x, y]) => [x * scaleX, y * scaleY]);
}

// Solves Ax=b via Gaussian elimination with partial pivoting.
function solveLinear(A, b) {
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

// Computes the 3x3 perspective transform H mapping src[i] to dst[i].
// Uses the Direct Linear Transform (DLT) formulation: 8 equations, 8 unknowns.
// Returns H as a flat 9-element array (row-major), with H[8]=1 (normalised).
function getPerspectiveTransform(src, dst) {
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

// Applies the perspective warp H to srcCanvas and writes a PLATE_W x PLATE_H canvas.
// Uses inverse mapping (per output pixel, find source pixel) + bilinear interpolation.
// Lee et al. (PMC, 2024) apply this step to normalise tilted plates before OCR.
function warpPerspective(srcCanvas, H) {
  const [h0,h1,h2,h3,h4,h5,h6,h7,h8] = H;
  const det = h0*(h4*h8-h5*h7) - h1*(h3*h8-h5*h6) + h2*(h3*h7-h4*h6);
  if (Math.abs(det) < 1e-10) return null;

  // Analytic inverse of a 3x3 matrix via cofactors / determinant
  const inv = [
    (h4*h8-h5*h7)/det, (h2*h7-h1*h8)/det, (h1*h5-h2*h4)/det,
    (h5*h6-h3*h8)/det, (h0*h8-h2*h6)/det, (h2*h3-h0*h5)/det,
    (h3*h7-h4*h6)/det, (h1*h6-h0*h7)/det, (h0*h4-h1*h3)/det,
  ];

  const sw = srcCanvas.width, sh = srcCanvas.height;
  const srcData = srcCanvas.getContext("2d").getImageData(0, 0, sw, sh).data;
  const out = document.createElement("canvas");
  out.width = PLATE_W;
  out.height = PLATE_H;
  const ctx = out.getContext("2d");
  const outData = ctx.createImageData(PLATE_W, PLATE_H);

  for (let v = 0; v < PLATE_H; v++) {
    for (let u = 0; u < PLATE_W; u++) {
      const wx = inv[0]*u + inv[1]*v + inv[2];
      const wy = inv[3]*u + inv[4]*v + inv[5];
      const ww = inv[6]*u + inv[7]*v + inv[8];
      const x = wx / ww, y = wy / ww;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= sw || y0 + 1 >= sh) continue;
      const fx = x - x0, fy = y - y0;
      const w00 = (1-fx)*(1-fy), w10 = fx*(1-fy), w01 = (1-fx)*fy, w11 = fx*fy;
      const oi = (v * PLATE_W + u) * 4;
      for (let c = 0; c < 3; c++) {
        const g = (px, py) => srcData[(py * sw + px) * 4 + c];
        outData.data[oi+c] = w00*g(x0,y0) + w10*g(x0+1,y0) + w01*g(x0,y0+1) + w11*g(x0+1,y0+1);
      }
      outData.data[oi+3] = 255;
    }
  }
  ctx.putImageData(outData, 0, 0);
  return out;
}

export async function runDetection(canvas, threshold = DETECTION_THRESHOLD) {
  const model = await getModel("plateDetector");

  const tensor = preprocess(canvas);
  const inputTensor = new ort.Tensor("float32", tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const outputs = await model.run({ [model.inputNames[0]]: inputTensor });

  // YOLOv8-seg: two outputs
  const output0 = outputs[model.outputNames[0]]; // [1, 37, numDets]  — 4 bbox + 1 conf + 32 mask coeffs
  const output1 = outputs[model.outputNames[1]]; // [1, 32, protoH, protoW] — mask prototypes

  const numDets  = output0.dims[2];
  const protoH   = output1.dims[2];
  const protoW   = output1.dims[3];
  const pred     = output0.data;
  const proto    = output1.data;
  const protoPixels = protoH * protoW;

  // Best detection by confidence (row 4)
  let bestConf = -1, bestIdx = -1;
  for (let i = 0; i < numDets; i++) {
    const conf = pred[4 * numDets + i];
    if (conf > bestConf) { bestConf = conf; bestIdx = i; }
  }
  if (bestConf < threshold) return [];

  // Bbox in model input space (416x416)
  const cx = pred[0 * numDets + bestIdx];
  const cy = pred[1 * numDets + bestIdx];
  const bw = pred[2 * numDets + bestIdx];
  const bh = pred[3 * numDets + bestIdx];
  const bx1 = cx - bw / 2, by1 = cy - bh / 2;
  const bx2 = cx + bw / 2, by2 = cy + bh / 2;

  // Scale bbox to original canvas coordinates
  const sx = canvas.width  / INPUT_SIZE;
  const sy = canvas.height / INPUT_SIZE;

  // Reconstruct segmentation mask: dot(coeffs, prototypes), sigmoid, threshold.
  // Only compute pixels inside the predicted bbox to save time.
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
        sum += pred[(5 + k) * numDets + bestIdx] * proto[k * protoPixels + py * protoW + px];
      }
      binary[py * protoW + px] = sigmoid(sum) > MASK_THRESHOLD ? 1 : 0;
    }
  }

  // Morphological closing: fills gaps caused by reflections or dirt on the plate.
  const closed = morphClose(binary, protoW, protoH, 2);

  // Find 4 corners from the mask, scaled to canvas coordinates.
  const corners = maskCorners(
    closed, protoW, protoH,
    canvas.width  / protoW,
    canvas.height / protoH,
  );

  return [{ x1: bx1*sx, y1: by1*sy, x2: bx2*sx, y2: by2*sy, confidence: bestConf, corners }];
}

// Perspective-corrects a plate region using the 4 corners found by runDetection.
// corners: [[tlX,tlY],[trX,trY],[brX,brY],[blX,blY]] in source pixel coordinates.
export function warpPlate(source, corners) {
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width  = source.videoWidth  ?? source.width;
  srcCanvas.height = source.videoHeight ?? source.height;
  srcCanvas.getContext("2d").drawImage(source, 0, 0);

  const dst = [[0,0],[PLATE_W-1,0],[PLATE_W-1,PLATE_H-1],[0,PLATE_H-1]];
  const H = getPerspectiveTransform(corners, dst);
  if (!H) return srcCanvas;

  return warpPerspective(srcCanvas, H) ?? srcCanvas;
}
