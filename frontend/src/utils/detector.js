import * as ort from "onnxruntime-web";
import { getModel, runInference } from "./modelRegistry";
import { DETECTION_THRESHOLD, NMS_IOU_THRESHOLD } from "../config";
import {
  INPUT_SIZE, PLATE_W, PLATE_H,
  getPerspectiveTransform, extractAllDetections,
} from "./detectorCore.js";

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

export function runDetection(canvas, threshold = DETECTION_THRESHOLD) {
  return _runDetection(canvas, threshold);
}

async function _runDetection(canvas, threshold) {
  const model = await getModel("plateDetector");

  const t0 = performance.now();
  const tensor = preprocess(canvas);
  const tPreprocess = performance.now();

  const inputTensor = new ort.Tensor("float32", tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const outputs = await runInference(model, { [model.inputNames[0]]: inputTensor });
  const tInference = performance.now();

  // YOLOv8-seg: two outputs
  const output0 = outputs[model.outputNames[0]]; // [1, 37, numDets]
  const output1 = outputs[model.outputNames[1]]; // [1, 32, protoH, protoW]

  const detections = extractAllDetections(
    output0.data, output1.data,
    output0.dims[2], output1.dims[2], output1.dims[3],
    canvas.width, canvas.height,
    threshold, NMS_IOU_THRESHOLD,
  );
  const tPost = performance.now();

  return detections.map(({ bbox, confidence, corners }) => ({ ...bbox, confidence, corners }));
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
