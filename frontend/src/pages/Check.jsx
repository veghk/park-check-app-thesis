import { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { runDetection } from "../utils/detector";
import { getModel } from "../utils/modelRegistry";
import { runOCR } from "../utils/ocr";
import { Stabilizer } from "../utils/stabilizer";
import client from "../api/client";

const STATE = {
  LOADING_MODEL: "loading_model",
  SCANNING:      "scanning",
  OCR:           "ocr",       // crop captured, running OCR in browser
  CHECKING:      "checking",  // OCR done, waiting for backend DB response
  RESULT:        "result",    // result received and shown
  OFFLINE:       "offline",   // no internet — plate queued locally
  ERROR:         "error",
};

const MODEL_KEY         = "plateDetector";
const FRAME_SKIP        = 6;
const RESULT_DISPLAY_MS = 3000;
const PENDING_KEY       = "parkcheck_pending";

const BOX_COLOR = {
  scanning:     "#9ca3af",
  registered:   "#16a34a",
  unregistered: "#ef4444",
  offline:      "#6b7280",
};

// ---------------------------------------------------------------------------
// Offline queue helpers
// ---------------------------------------------------------------------------

function getPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); }
  catch { return []; }
}

function addPending(plateText) {
  const q = getPending();
  q.push({ plateText, timestamp: Date.now() });
  localStorage.setItem(PENDING_KEY, JSON.stringify(q));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Check() {
  const navigate = useNavigate();
  const videoRef       = useRef(null);
  const overlayRef     = useRef(null);
  const offscreenRef   = useRef(null);
  const streamRef      = useRef(null);
  const rafRef         = useRef(null);
  const frameCountRef  = useRef(0);
  const stabilizerRef  = useRef(null);
  const resultTimerRef = useRef(null);

  const [appState,     setAppState]     = useState(STATE.LOADING_MODEL);
  const [result,       setResult]       = useState(null);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [modelReady,   setModelReady]   = useState(false);
  const [modelFailed,  setModelFailed]  = useState(false);
  const [pendingCount, setPendingCount] = useState(() => getPending().length);

  const drawBoxes = useCallback((boxes, color) => {
    const canvas = overlayRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    boxes.forEach(({ x1, y1, x2, y2 }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    });
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Flush queued offline checks to backend
  const syncPending = useCallback(async () => {
    const pending = getPending();
    if (!pending.length) return;
    const remaining = [];
    for (const item of pending) {
      try {
        await client.post("/api/check/", { plate_text: item.plateText });
      } catch {
        remaining.push(item);
      }
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
    setPendingCount(remaining.length);
  }, []);

  // Core check: crop → OCR (browser) → backend DB check (or offline queue)
  const checkPlate = useCallback(async (box) => {
    const video = videoRef.current;
    if (!video) return;

    // 1. Crop the plate region from video
    const { x1, y1, x2, y2 } = box;
    const crop = document.createElement("canvas");
    crop.width  = Math.max(1, x2 - x1);
    crop.height = Math.max(1, y2 - y1);
    crop.getContext("2d").drawImage(
      video, x1, y1, crop.width, crop.height,
      0, 0, crop.width, crop.height,
    );

    // 2. Run OCR in the browser
    setAppState(STATE.OCR);
    const plateText = await runOCR(crop);

    if (!plateText) {
      // OCR returned nothing — model not loaded yet or unreadable plate
      setAppState(STATE.SCANNING);
      stabilizerRef.current?.reset();
      return;
    }

    // 3. Send plate text to backend, or queue if offline
    if (!navigator.onLine) {
      addPending(plateText);
      setPendingCount(getPending().length);
      drawBoxes([box], BOX_COLOR.offline);
      setAppState(STATE.OFFLINE);
      resultTimerRef.current = setTimeout(() => {
        setAppState(STATE.SCANNING);
        stabilizerRef.current?.reset();
        clearCanvas();
      }, RESULT_DISPLAY_MS);
      return;
    }

    setAppState(STATE.CHECKING);
    try {
      const { data } = await client.post("/api/check/", { plate_text: plateText });
      setResult(data);
      setAppState(STATE.RESULT);
      drawBoxes([box], data.registered ? BOX_COLOR.registered : BOX_COLOR.unregistered);
      resultTimerRef.current = setTimeout(() => {
        setResult(null);
        setAppState(STATE.SCANNING);
        stabilizerRef.current?.reset();
        clearCanvas();
      }, RESULT_DISPLAY_MS);
    } catch {
      setErrorMsg("Failed to check plate. Please try again.");
      setAppState(STATE.ERROR);
    }
  }, [drawBoxes, clearCanvas]);

  // Detection loop — runs every FRAME_SKIP frames
  const startLoop = useCallback(() => {
    if (!videoRef.current) return;
    const offscreen = document.createElement("canvas");
    offscreenRef.current = offscreen;

    const loop = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      frameCountRef.current++;
      if (frameCountRef.current % FRAME_SKIP === 0) {
        offscreen.width  = video.videoWidth;
        offscreen.height = video.videoHeight;
        offscreen.getContext("2d").drawImage(video, 0, 0);

        if (modelReady) {
          try {
            const boxes = await runDetection(offscreen);
            const best  = boxes[0] ?? null;
            drawBoxes(best ? [best] : [], BOX_COLOR.scanning);
            stabilizerRef.current?.update(best);
          } catch {
            // non-fatal — skip frame
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [drawBoxes, modelReady]);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(resultTimerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Init camera + load detection model
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        stabilizerRef.current = new Stabilizer(checkPlate, 1000);
        setAppState(STATE.SCANNING);
      } catch (e) {
        if (cancelled) return;
        const msg =
          e.name === "NotFoundError"   || e.name === "DevicesNotFoundError"  ? "No camera found on this device."
        : e.name === "NotAllowedError" || e.name === "PermissionDeniedError" ? "Camera access denied. Please allow camera permission in your browser."
        : `Camera error: ${e.message}`;
        setErrorMsg(msg);
        setAppState(STATE.ERROR);
        return;
      }

      try {
        await getModel(MODEL_KEY);
        if (!cancelled) setModelReady(true);
      } catch {
        if (!cancelled) setModelFailed(true);
      }
    }

    init();
    return () => { cancelled = true; stopAll(); };
  }, [checkPlate, stopAll]);

  // Sync queued checks when network comes back
  useEffect(() => {
    window.addEventListener("online", syncPending);
    return () => window.removeEventListener("online", syncPending);
  }, [syncPending]);

  useEffect(() => {
    if (appState === STATE.SCANNING) startLoop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [appState, startLoop]);

  function handleRetry() {
    setErrorMsg("");
    setResult(null);
    setAppState(STATE.LOADING_MODEL);
    stopAll();
    window.location.reload();
  }

  const isScanning = appState === STATE.SCANNING;

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={overlayRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none" />

        {/* Detection model loading bar */}
        {isScanning && !modelReady && !modelFailed && (
          <div className="absolute top-0 left-0 right-0 pointer-events-none">
            <div className="h-1 bg-white/10 overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-loading-bar" style={{ width: "40%" }} />
            </div>
            <div className="flex justify-center mt-3">
              <span className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                Preparing detection…
              </span>
            </div>
          </div>
        )}

        {/* Pending offline sync counter */}
        {pendingCount > 0 && isScanning && (
          <div className="absolute top-4 right-4">
            <span className="bg-gray-700/80 text-white text-xs px-2.5 py-1 rounded-full">
              {pendingCount} pending sync
            </span>
          </div>
        )}

        {/* Scanning hint */}
        {isScanning && (
          <div className="absolute bottom-24 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">
            {modelFailed  && <span className="bg-black/50 text-white/60 text-xs px-3 py-1 rounded-full">Detection unavailable — no model loaded</span>}
            {modelReady   && <span className="bg-black/50 text-white text-xs px-3 py-1 rounded-full">Point camera at a licence plate</span>}
            {!modelReady && !modelFailed && <span className="bg-black/50 text-white text-xs px-3 py-1 rounded-full">Camera ready — loading detection…</span>}
          </div>
        )}

        {/* OCR in progress */}
        {appState === STATE.OCR && (
          <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none">
            <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-full flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Reading plate…
            </span>
          </div>
        )}

        {/* Backend check in progress */}
        {appState === STATE.CHECKING && (
          <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none">
            <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-full flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Checking registration…
            </span>
          </div>
        )}

        {/* Offline — check queued */}
        {appState === STATE.OFFLINE && (
          <div className="absolute bottom-24 left-0 right-0 flex justify-center">
            <div className="bg-gray-700/90 px-5 py-3 rounded-xl text-white text-center shadow-lg">
              <p className="text-sm font-semibold">No internet connection</p>
              <p className="text-xs mt-0.5 opacity-70">Check saved — will sync when online</p>
            </div>
          </div>
        )}

        {/* Result */}
        {appState === STATE.RESULT && result && (
          <div className="absolute bottom-24 left-0 right-0 flex justify-center">
            <div className={`px-5 py-3 rounded-xl text-white text-center shadow-lg ${result.registered ? "bg-green-600" : "bg-red-500"}`}>
              <p className="text-lg font-bold tracking-widest">{result.plate_text}</p>
              <p className="text-xs mt-0.5 opacity-80">
                {result.registered ? `Registered — ${result.owner_name}` : "Not registered"}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {appState === STATE.ERROR && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center px-8 gap-5">
            <p className="text-white text-center text-sm">{errorMsg}</p>
            <button onClick={handleRetry}
              className="px-8 py-2.5 bg-white text-gray-900 text-sm font-semibold rounded-xl">
              Try Again
            </button>
            <button onClick={() => navigate("/")} className="text-white/60 text-sm">
              Go back
            </button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
