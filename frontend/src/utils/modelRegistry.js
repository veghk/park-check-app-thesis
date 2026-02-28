import * as ort from "onnxruntime-web";

// Point onnxruntime-web to its WASM runtime files via CDN.
// This avoids MIME type issues with local dev servers.
// WASM files are copied from node_modules to public/ort/ at container startup (see Dockerfile CMD).
ort.env.wasm.wasmPaths = "/ort/";

// Registry of available models.
// To swap in a custom model, update the `url` field.
const REGISTRY = {
  plateDetector: {
    name: "Licence Plate Detector",
    url: "/models/plate-detector.onnx",
    inputSize: 640,
  },
};

// Module-level cache — sessions survive component remounts within the same page session.
const _sessions = {};
const _loading = {};

export function getAvailableModels() {
  return Object.entries(REGISTRY).map(([key, meta]) => ({
    key,
    name: meta.name,
    loaded: key in _sessions,
  }));
}

export async function getModel(key) {
  if (_sessions[key]) {
    console.log(`[Model] "${key}" already loaded — returning cached session`);
    return _sessions[key];
  }

  // Prevent duplicate loads if called concurrently
  if (_loading[key]) {
    console.log(`[Model] "${key}" already loading — waiting for existing promise`);
    return _loading[key];
  }

  const meta = REGISTRY[key];
  if (!meta) throw new Error(`Unknown model: "${key}"`);

  console.log(`[Model] Starting load: "${key}" from ${meta.url}`);

  _loading[key] = ort.InferenceSession.create(meta.url, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  }).then((session) => {
    console.log(`[Model] "${key}" loaded successfully`);
    _sessions[key] = session;
    delete _loading[key];
    return session;
  }).catch((err) => {
    console.error(`[Model] Failed to load "${key}":`, err);
    delete _loading[key];
    throw err;
  });

  return _loading[key];
}

export function getModelMeta(key) {
  return REGISTRY[key] ?? null;
}
