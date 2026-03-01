/**
 * Plate OCR — runs the fast-plate-ocr ONNX model in the browser.
 *
 * The model (european-plates-mobile-vit-v2-model) must be placed at:
 *   frontend/public/models/plate-ocr.onnx
 *
 * To extract the model after Docker build:
 *   docker exec <web> python -c \
 *     "from fast_plate_ocr import ONNXPlateRecognizer; \
 *      r = ONNXPlateRecognizer('european-plates-mobile-vit-v2-model'); \
 *      print(r.model_path)"
 *   docker cp <web>:<model_path> frontend/public/models/plate-ocr.onnx
 *
 * Input tensor:  [1, 3, INPUT_H, INPUT_W]  float32, normalised 0–1  (RGB)
 * Output tensor: [1, SEQ_LEN, NUM_CHARS]  — CTC logits over the character set
 *
 * TODO: confirm INPUT_H, INPUT_W, and output shape by inspecting the model:
 *   import onnx; m = onnx.load("plate-ocr.onnx"); print(m.graph.input, m.graph.output)
 */

import * as ort from "onnxruntime-web";
import { getModel } from "./modelRegistry";

const MODEL_KEY = "plateOCR";

// European plate character set used by fast-plate-ocr (index 0 = CTC blank)
const CHARS = "_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Expected input dimensions — update once model is inspected
const INPUT_H = 70;
const INPUT_W = 140;

/** Resize crop canvas to model input size and convert to CHW float32 tensor. */
function preprocess(canvas) {
  const tmp = document.createElement("canvas");
  tmp.width = INPUT_W;
  tmp.height = INPUT_H;
  tmp.getContext("2d").drawImage(canvas, 0, 0, INPUT_W, INPUT_H);

  const { data } = tmp.getContext("2d").getImageData(0, 0, INPUT_W, INPUT_H);
  const tensor = new Float32Array(3 * INPUT_W * INPUT_H);
  const plane = INPUT_W * INPUT_H;
  for (let i = 0; i < plane; i++) {
    tensor[i]           = data[i * 4]     / 255; // R
    tensor[plane + i]   = data[i * 4 + 1] / 255; // G
    tensor[2 * plane + i] = data[i * 4 + 2] / 255; // B
  }
  return tensor;
}

/** CTC greedy decode: collapse repeated chars, remove blanks (index 0). */
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

/**
 * Run OCR on a plate crop canvas.
 * Returns the recognised plate string (uppercase alphanumeric), or "" if the
 * model is not yet available or inference fails.
 */
export async function runOCR(cropCanvas) {
  let session;
  try {
    session = await getModel(MODEL_KEY);
  } catch {
    // Model file not present yet — caller handles empty string gracefully
    return "";
  }

  try {
    const tensor = preprocess(cropCanvas);
    const inputName = session.inputNames[0];
    const inputTensor = new ort.Tensor("float32", tensor, [1, 3, INPUT_H, INPUT_W]);
    const output = await session.run({ [inputName]: inputTensor });

    const out = output[session.outputNames[0]];
    const shape = out.dims; // e.g. [1, seqLen, numClasses]
    const seqLen = shape[1];
    const numClasses = shape[2];

    return ctcDecode(out.data, seqLen, numClasses);
  } catch (err) {
    console.warn("[OCR] inference failed:", err);
    return "";
  }
}
