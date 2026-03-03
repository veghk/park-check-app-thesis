import * as ort from "onnxruntime-web";

// WASM files are copied from node_modules to public/ort/ at container startup
ort.env.wasm.wasmPaths = "/ort/";

const REGISTRY = {
  plateDetector: { url: "/models/plate-segmentor.onnx" },
  plateOCR:      { url: "/models/plate-ocr.onnx" },
};

const _sessions = {};
const _loading  = {};

export async function getModel(key) {
  if (_sessions[key]) return _sessions[key];
  if (_loading[key])  return _loading[key];

  const meta = REGISTRY[key];
  if (!meta) throw new Error(`Unknown model: "${key}"`);

  _loading[key] = ort.InferenceSession.create(meta.url, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  }).then((session) => {
    _sessions[key] = session;
    delete _loading[key];
    return session;
  }).catch((err) => {
    delete _loading[key];
    throw err;
  });

  return _loading[key];
}
