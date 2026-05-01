import * as ort from "onnxruntime-web";
import { getModel, runInference } from "./modelRegistry";

// european-plates-mobile-vit-v2 model specs:
//   Input:  [1, 70, 140, 1]  NHWC grayscale uint8
//   Output: [1, 333] = [1, 9 slots × 37 classes] multi-head softmax
//   Alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_"  (_ = pad at index 36)
const INPUT_H  = 70;
const INPUT_W  = 140;
const N_SLOTS  = 9;
const N_CHARS  = 37;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_";
const PAD_CHAR = "_";

// Resize canvas to INPUT_W×INPUT_H and convert to grayscale uint8 [H, W, 1]
function preprocess(canvas) {
  const tmp = document.createElement("canvas");
  tmp.width  = INPUT_W;
  tmp.height = INPUT_H;
  tmp.getContext("2d").drawImage(canvas, 0, 0, INPUT_W, INPUT_H);
  const { data } = tmp.getContext("2d").getImageData(0, 0, INPUT_W, INPUT_H);
  const tensor = new Uint8Array(INPUT_H * INPUT_W);
  for (let i = 0; i < INPUT_H * INPUT_W; i++) {
    // BT.601 luma from RGBA
    tensor[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  }
  return tensor;
}

// Reshape [333] → [9, 37], argmax each slot, map to chars, drop padding
function decode(flat) {
  let text = "";
  for (let s = 0; s < N_SLOTS; s++) {
    let best = 0, bestVal = -Infinity;
    for (let c = 0; c < N_CHARS; c++) {
      const v = flat[s * N_CHARS + c];
      if (v > bestVal) { bestVal = v; best = c; }
    }
    const ch = ALPHABET[best];
    if (ch !== PAD_CHAR) text += ch;
  }
  return text;
}

export async function runOCR(cropCanvas) {
  return _runOCR(cropCanvas);
}

async function _runOCR(cropCanvas) {
  let model;
  try {
    model = await getModel("plateOCR");
  } catch (e) {
    console.error("[OCR] model load failed:", e);
    return "";
  }

  try {
    const t0 = performance.now();
    const pixels = preprocess(cropCanvas);
    const tPreprocess = performance.now();

    const inputTensor = new ort.Tensor("uint8", pixels, [1, INPUT_H, INPUT_W, 1]);
    const output = await runInference(model, { [model.inputNames[0]]: inputTensor });
    const tInference = performance.now();

    const out  = output[model.outputNames[0]];
    const text = decode(out.data);
    const tDecode = performance.now();

    return text;
  } catch (e) {
    console.error("[OCR] inference failed:", e);
    return "";
  }
}
