import * as ort from "onnxruntime-web";
import { getModel } from "./modelRegistry";
import { DETECTION_THRESHOLD, NMS_IOU_THRESHOLD } from "../config";

const INPUT_SIZE = 640;

function preprocess(canvas, inputSize) {
  const offscreen = document.createElement("canvas");
  offscreen.width = inputSize;
  offscreen.height = inputSize;
  offscreen.getContext("2d").drawImage(canvas, 0, 0, inputSize, inputSize);

  const { data } = offscreen.getContext("2d").getImageData(0, 0, inputSize, inputSize);
  const tensor = new Float32Array(3 * inputSize * inputSize);
  for (let i = 0; i < inputSize * inputSize; i++) {
    tensor[i] = data[i * 4] / 255;
    tensor[inputSize * inputSize + i] = data[i * 4 + 1] / 255;
    tensor[2 * inputSize * inputSize + i] = data[i * 4 + 2] / 255;
  }
  return tensor;
}

function iou(a, b) {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const aArea = (a.x2 - a.x1) * (a.y2 - a.y1);
  const bArea = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (aArea + bArea - inter);
}

function nms(boxes, iouThreshold = NMS_IOU_THRESHOLD) {
  boxes.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  const suppressed = new Set();
  for (let i = 0; i < boxes.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(boxes[i]);
    for (let j = i + 1; j < boxes.length; j++) {
      if (iou(boxes[i], boxes[j]) > iouThreshold) suppressed.add(j);
    }
  }
  return kept;
}

export async function runDetection(canvas, threshold = DETECTION_THRESHOLD) {
  const model = await getModel("plateDetector");

  const scaleX = canvas.width / INPUT_SIZE;
  const scaleY = canvas.height / INPUT_SIZE;

  const tensor = preprocess(canvas, INPUT_SIZE);
  const inputName = model.inputNames[0];
  const inputTensor = new ort.Tensor("float32", tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const results = await model.run({ [inputName]: inputTensor });

  const output = results[model.outputNames[0]].data;
  const numDets = 8400;
  const boxes = [];

  for (let i = 0; i < numDets; i++) {
    const confidence = output[4 * numDets + i];
    if (confidence < threshold) continue;

    const cx = output[0 * numDets + i];
    const cy = output[1 * numDets + i];
    const w  = output[2 * numDets + i];
    const h  = output[3 * numDets + i];

    boxes.push({
      x1: (cx - w / 2) * scaleX,
      y1: (cy - h / 2) * scaleY,
      x2: (cx + w / 2) * scaleX,
      y2: (cy + h / 2) * scaleY,
      confidence,
    });
  }

  return nms(boxes);
}
