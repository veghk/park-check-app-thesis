import * as ort from "onnxruntime-web";
import { getModel } from "./modelRegistry";

// European plate character set (index 0 = CTC blank)
const CHARS = "_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Input dimensions for european-plates-mobile-vit-v2-model
const INPUT_H = 70;
const INPUT_W = 140;

function preprocess(canvas) {
  const tmp = document.createElement("canvas");
  tmp.width = INPUT_W;
  tmp.height = INPUT_H;
  tmp.getContext("2d").drawImage(canvas, 0, 0, INPUT_W, INPUT_H);

  const { data } = tmp.getContext("2d").getImageData(0, 0, INPUT_W, INPUT_H);
  const tensor = new Float32Array(3 * INPUT_W * INPUT_H);
  const plane = INPUT_W * INPUT_H;
  for (let i = 0; i < plane; i++) {
    tensor[i]             = data[i * 4]     / 255; // R
    tensor[plane + i]     = data[i * 4 + 1] / 255; // G
    tensor[2 * plane + i] = data[i * 4 + 2] / 255; // B
  }
  return tensor;
}

function ctcDecode(logits, seqLen, numClasses) {
  let prev = -1;
  let text = "";
  for (let t = 0; t < seqLen; t++) {
    let best = 0;
    let bestVal = -Infinity;
    for (let c = 0; c < numClasses; c++) {
      const v = logits[t * numClasses + c];
      if (v > bestVal) { bestVal = v; best = c; }
    }
    if (best !== prev && best !== 0) text += CHARS[best] ?? "";
    prev = best;
  }
  return text;
}

export async function runOCR(cropCanvas) {
  let model;
  try {
    model = await getModel("plateOCR");
  } catch {
    return "";
  }

  try {
    const tensor = preprocess(cropCanvas);
    const inputTensor = new ort.Tensor("float32", tensor, [1, 3, INPUT_H, INPUT_W]);
    const output = await model.run({ [model.inputNames[0]]: inputTensor });
    const out = output[model.outputNames[0]];
    return ctcDecode(out.data, out.dims[1], out.dims[2]);
  } catch {
    return "";
  }
}
