import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getModel } from "../utils/modelRegistry";

const MODEL_KEY = "plateDetector";

const STEPS = [
  { key: "auth",  label: "Authenticated" },
  { key: "model", label: "Loading detection model" },
  { key: "ready", label: "All systems ready" },
];

const STATUS = { PENDING: "pending", LOADING: "loading", DONE: "done", ERROR: "error" };

function StepIcon({ status }) {
  if (status === STATUS.DONE) {
    return (
      <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === STATUS.LOADING) {
    return (
      <div className="w-5 h-5 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
    );
  }
  if (status === STATUS.ERROR) {
    return (
      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  return <div className="w-5 h-5 rounded-full border-2 border-gray-200" />;
}

export default function Setup() {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState({
    auth: STATUS.DONE,
    model: STATUS.LOADING,
    ready: STATUS.PENDING,
  });
  const [errorMsg, setErrorMsg] = useState("");

  function set(key, value) {
    setStatuses((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    async function run() {
      console.log("[Setup] Starting setup sequence");
      try {
        console.log("[Setup] Loading model...");
        await getModel(MODEL_KEY);
        console.log("[Setup] Model loaded — marking done");
        set("model", STATUS.DONE);
        set("ready", STATUS.LOADING);

        // Brief pause so user can see "Ready" before navigating
        await new Promise((r) => setTimeout(r, 600));
        set("ready", STATUS.DONE);
        await new Promise((r) => setTimeout(r, 400));

        console.log("[Setup] Setup complete — navigating to home");
        navigate("/", { replace: true });
      } catch (err) {
        console.error("[Setup] Model load failed:", err);
        set("model", STATUS.ERROR);
        setErrorMsg("Failed to load detection model. The app will work without real-time detection.");

        // Continue anyway after a short delay
        await new Promise((r) => setTimeout(r, 2000));
        console.log("[Setup] Continuing without model — navigating to home");
        navigate("/", { replace: true });
      }
    }

    run();
  }, [navigate]);

  const doneCount = Object.values(statuses).filter((s) => s === STATUS.DONE).length;
  const progress = Math.round((doneCount / STEPS.length) * 100);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8">
      {/* Wordmark */}
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold text-green-900 tracking-tight">Park Check</h1>
        <p className="text-sm text-gray-400 mt-1">Setting up your session</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs mb-8">
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="w-full max-w-xs space-y-4">
        {STEPS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3">
            <div className="shrink-0 w-8 h-8 flex items-center justify-center">
              <StepIcon status={statuses[key]} />
            </div>
            <span
              className={`text-sm font-medium transition-colors ${
                statuses[key] === STATUS.DONE
                  ? "text-gray-900"
                  : statuses[key] === STATUS.LOADING
                  ? "text-gray-700"
                  : statuses[key] === STATUS.ERROR
                  ? "text-red-500"
                  : "text-gray-300"
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {errorMsg && (
        <p className="mt-6 text-xs text-gray-400 text-center max-w-xs">{errorMsg}</p>
      )}
    </div>
  );
}
