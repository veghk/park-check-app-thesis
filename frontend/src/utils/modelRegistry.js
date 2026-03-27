import * as ort from "onnxruntime-web";

// WASM files are copied from node_modules to public/ort/ at container startup
ort.env.wasm.wasmPaths = "/ort/";

const hasWebGPU = !!navigator.gpu;
const hasWebGL  = !!document.createElement("canvas").getContext("webgl2");
const GPU_PROVIDERS = hasWebGPU ? ["webgpu", "wasm"] : hasWebGL ? ["webgl", "wasm"] : ["wasm"];

const REGISTRY = {
  // Large model - benefits from GPU acceleration
  plateDetector: { url: "/models/plate-segmentor.onnx", providers: GPU_PROVIDERS },
  // Small model - WebGPU causes "Session already started" errors in ORT 1.18
  plateOCR:      { url: "/models/plate-ocr.onnx",       providers: ["wasm"] },
};

// ORT's JSEP WASM runtime has a global mutex - only one model.run() at a time across all sessions.
// Both detector and ocr must use this shared lock to avoid "Session already started" errors.
let _inferenceLock = Promise.resolve();
export function runInference(session, inputs) {
  return (_inferenceLock = _inferenceLock.then(() => session.run(inputs)));
}

const _sessions = {};
const _loading  = {};

export async function getModel(key) {
  if (_sessions[key]) return _sessions[key];
  if (_loading[key])  return _loading[key];

  const meta = REGISTRY[key];
  if (!meta) throw new Error(`Unknown model: "${key}"`);

  _loading[key] = ort.InferenceSession.create(meta.url, {
    executionProviders: meta.providers,
    graphOptimizationLevel: "all",
  }).then((session) => {
    console.log(`[Model] ${key} ready (providers tried: ${meta.providers.join(", ")})`);
    _sessions[key] = session;
    delete _loading[key];
    return session;
  }).catch((err) => {
    delete _loading[key];
    throw err;
  });

  return _loading[key];
}
