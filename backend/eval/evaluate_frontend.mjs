/**
 * Evaluates the plate-segmentor.onnx model using the *exact same JS code* that
 * runs in the browser (detectorCore.js), so results are directly comparable to
 * what users see in production.
 *
 * Dependencies: onnxruntime-node and sharp are in frontend/package.json devDependencies.
 *   cd frontend && npm install   (if not already done)
 *
 * Run from project root:
 *   node backend/eval/evaluate_frontend.mjs
 *
 * ground_truth.json entries must have a "box" key with [x1, y1, x2, y2] in pixels.
 */

import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Import the actual production code — same file the browser uses.
import { extractDetection, INPUT_SIZE } from "../../frontend/src/utils/detectorCore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MODEL_PATH = join(__dirname, "../../frontend/public/models/plate-segmentor.onnx");
const GT_PATH    = join(__dirname, "test_plates/ground_truth.json");
const PLATES_DIR = join(__dirname, "test_plates");

const IOU_THRESHOLD  = 0.5;
const CONF_THRESHOLD = 0.4;

function iou(a, b) {
  const ix1 = Math.max(a[0], b[0]), iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]), iy2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const aArea = (a[2] - a[0]) * (a[3] - a[1]);
  const bArea = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (aArea + bArea - inter + 1e-6);
}

async function loadImageTensor(imgPath) {
  const meta = await sharp(imgPath).metadata();
  const origW = meta.width;
  const origH = meta.height;

  const { data } = await sharp(imgPath)
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = INPUT_SIZE * INPUT_SIZE;
  const tensor = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    tensor[i]            = data[i * 3]     / 255;
    tensor[pixels + i]   = data[i * 3 + 1] / 255;
    tensor[2 * pixels+i] = data[i * 3 + 2] / 255;
  }
  return { tensor, origW, origH };
}

async function main() {
  const gt = JSON.parse(readFileSync(GT_PATH, "utf8"));
  const detGt = Object.entries(gt).filter(
    ([k, v]) => !k.startsWith("_") && typeof v === "object" && v !== null && v.box,
  );

  if (detGt.length === 0) {
    console.error("No entries with 'box' found in ground_truth.json.");
    process.exit(1);
  }

  console.log(`Loading model: ${MODEL_PATH}`);
  const session = await ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ["cpu"],
  });

  let ok = 0, miss = 0, noDetect = 0;
  const ious = [];

  console.log(`\nEvaluating ${detGt.length} images (JS/production code path)...\n`);

  for (const [filename, entry] of detGt) {
    const imgPath = join(PLATES_DIR, filename);

    let tensor, origW, origH;
    try {
      ({ tensor, origW, origH } = await loadImageTensor(imgPath));
    } catch {
      console.log(`  ${filename.padEnd(36)}  FILE NOT FOUND`);
      noDetect++;
      continue;
    }

    const inputTensor = new ort.Tensor("float32", tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const outputs = await session.run({ [session.inputNames[0]]: inputTensor });

    const output0 = outputs[session.outputNames[0]]; // [1, 37, numDets]
    const output1 = outputs[session.outputNames[1]]; // [1, 32, protoH, protoW]

    const result = extractDetection(
      output0.data, output1.data,
      output0.dims[2], output1.dims[2], output1.dims[3],
      origW, origH,
      CONF_THRESHOLD,
    );

    if (!result || !result.corners) {
      console.log(`  ${filename.padEnd(36)}  NO DETECTION`);
      noDetect++;
      continue;
    }

    const { corners, confidence } = result;
    // corners: [TL, TR, BR, BL] — use TL and BR for the axis-aligned box
    const predBox = [corners[0][0], corners[0][1], corners[2][0], corners[2][1]];
    const boxIou  = iou(predBox, entry.box);

    ious.push(boxIou);
    if (boxIou >= IOU_THRESHOLD) ok++;
    else miss++;

    const label = boxIou >= IOU_THRESHOLD ? "OK  " : "MISS";
    console.log(
      `  ${filename.padEnd(36)}  ${label}  conf=${confidence.toFixed(2)}  IoU=${boxIou.toFixed(2)}`,
    );
  }

  const total   = ok + miss + noDetect;
  const meanIou = ious.length
    ? (ious.reduce((a, b) => a + b, 0) / ious.length).toFixed(3)
    : "N/A";

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Images evaluated : ${total}`);
  console.log(`Detected (IoU≥${IOU_THRESHOLD}): ${ok}  |  Low IoU: ${miss}  |  No detection: ${noDetect}`);
  console.log(`Detection rate   : ${total ? ((ok / total) * 100).toFixed(1) : 0}%`);
  console.log(`Mean IoU         : ${meanIou}`);
}

main().catch(err => { console.error(err); process.exit(1); });
