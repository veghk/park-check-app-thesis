import { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Tracker } from "../utils/tracker";
import { runDetection, warpPlate } from "../utils/detector";
import { getModel } from "../utils/modelRegistry";
import { runOCR } from "../utils/ocr";
import BottomNav from "../components/BottomNav";
import client from "../api/client";
import {
  FRAME_SKIP,
  CAMERA_WIDTH,
  CAMERA_HEIGHT,
} from "../config";

const STATE = {
  LOADING_MODEL: "loading_model",
  SCANNING:      "scanning",
  ERROR:         "error",
};

const PENDING_KEY = "parkcheck_pending";

const BOX_COLOR = {
  scanning:     "#9ca3af",
  registered:   "#16a34a",
  unregistered: "#ef4444",
  offline:      "#6b7280",
};

function getPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); }
  catch { return []; }
}

function addPending(plateText) {
  const q = getPending();
  q.push({ plateText, timestamp: Date.now() });
  localStorage.setItem(PENDING_KEY, JSON.stringify(q));
}

// Draw all tracked boxes on the canvas, with result labels below each box.
function drawTracks(canvas, video, tracks) {
  if (!canvas || !video) return;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const { box, result } of tracks) {
    const color =
      result?.registered === true  ? BOX_COLOR.registered  :
      result?.registered === false ? BOX_COLOR.unregistered :
      result?.offline              ? BOX_COLOR.offline      :
                                     BOX_COLOR.scanning;

    ctx.strokeStyle = color;
    ctx.lineWidth   = 3;

    if (box.corners) {
      ctx.beginPath();
      ctx.moveTo(box.corners[0][0], box.corners[0][1]);
      for (let i = 1; i < box.corners.length; i++) ctx.lineTo(box.corners[i][0], box.corners[i][1]);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
    }

    if (result) {
      const label =
        result.offline    ? `${result.plate_text} · saved offline` :
        result.registered ? `${result.plate_text} · ${result.owner_name}` :
        result.plate_text ? `${result.plate_text} · not registered` :
                            "no text read";

      const bx = box.corners ? box.corners[3][0] : box.x1;
      const by = box.corners ? box.corners[3][1] : box.y2;

      ctx.font = "bold 15px sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(bx, by + 4, tw + 14, 24);
      ctx.fillStyle = "white";
      ctx.fillText(label, bx + 7, by + 20);
    }
  }
}

export default function Check() {
  const navigate = useNavigate();
  const videoRef      = useRef(null);
  const overlayRef    = useRef(null);
  const streamRef     = useRef(null);
  const rafRef        = useRef(null);
  const frameCountRef = useRef(0);
  const trackerRef    = useRef(null);

  const [appState,     setAppState]     = useState(STATE.LOADING_MODEL);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [modelReady,   setModelReady]   = useState(false);
  const [modelFailed,  setModelFailed]  = useState(false);
  const [pendingCount, setPendingCount] = useState(() => getPending().length);

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

  // Called by the tracker when a plate has been stable long enough.
  // Runs OCR + backend check and writes the result back onto the track object
  // so the next draw call picks it up. The camera keeps running the whole time.
  const checkPlate = useCallback(async (track) => {
    const video = videoRef.current;
    if (!video) return;

    const box = track.latestBox;
    let crop;
    if (box.corners) {
      crop = warpPlate(video, box.corners);
    } else {
      const { x1, y1, x2, y2 } = box;
      crop = document.createElement("canvas");
      crop.width  = Math.max(1, x2 - x1);
      crop.height = Math.max(1, y2 - y1);
      crop.getContext("2d").drawImage(video, x1, y1, crop.width, crop.height, 0, 0, crop.width, crop.height);
    }

    const plateText = await runOCR(crop);
    if (!plateText) {
      track.result = { plate_text: "" };
      return;
    }

    if (!navigator.onLine) {
      addPending(plateText);
      setPendingCount(getPending().length);
      track.result = { offline: true, plate_text: plateText };
      return;
    }

    try {
      const { data } = await client.post("/api/check/", { plate_text: plateText });
      track.result = data;
    } catch {
      track.result = { plate_text: plateText };
    }
  }, []);

  const startLoop = useCallback(() => {
    if (!videoRef.current) return;
    const offscreen = document.createElement("canvas");

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
            trackerRef.current?.update(boxes);
          } catch {
            // skip frame on error
          }
        }
      }

      // Draw every frame so the overlay stays smooth even between detections
      drawTracks(overlayRef.current, video, trackerRef.current?.activeBoxes() ?? []);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [modelReady]);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: CAMERA_WIDTH }, height: { ideal: CAMERA_HEIGHT } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        trackerRef.current = new Tracker(checkPlate);
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
        await getModel("plateDetector");
        if (!cancelled) setModelReady(true);
      } catch {
        if (!cancelled) setModelFailed(true);
      }
    }

    init();
    return () => { cancelled = true; stopAll(); };
  }, [checkPlate, stopAll]);

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

        {pendingCount > 0 && isScanning && (
          <div className="absolute top-4 right-4">
            <span className="bg-gray-700/80 text-white text-xs px-2.5 py-1 rounded-full">
              {pendingCount} pending sync
            </span>
          </div>
        )}

        {isScanning && (
          <div className="absolute bottom-24 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">
            {modelFailed  && <span className="bg-black/50 text-white/60 text-xs px-3 py-1 rounded-full">Detection unavailable, no model loaded</span>}
            {modelReady   && <span className="bg-black/50 text-white text-xs px-3 py-1 rounded-full">Point camera at a licence plate</span>}
            {!modelReady && !modelFailed && <span className="bg-black/50 text-white text-xs px-3 py-1 rounded-full">Camera ready, loading detection...</span>}
          </div>
        )}

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
