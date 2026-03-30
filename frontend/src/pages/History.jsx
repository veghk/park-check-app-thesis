import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import client from "../api/client";

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function History() {
  const navigate = useNavigate();
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    client.get("/api/logs/")
      .then(({ data }) => setLogs(data))
      .catch(() => setError("Failed to load history."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <div className="bg-green-900 px-5 pt-14 pb-8 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 mr-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <p className="text-green-300 text-sm font-medium">Enforcement log</p>
          <h1 className="text-2xl font-bold text-white mt-0.5">History</h1>
        </div>
      </div>

      <div className="px-5 py-5 space-y-3">
        {loading && (
          <p className="text-center text-gray-400 text-sm py-12">Loading…</p>
        )}

        {!loading && error && (
          <p className="text-center text-red-400 text-sm py-12">{error}</p>
        )}

        {!loading && !error && logs.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-12">No checks yet.</p>
        )}

        {logs.map((log) => (
          <div key={log.id}
            className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-center gap-4"
          >
            {/* Status dot */}
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${log.registered ? "bg-green-500" : "bg-red-500"}`} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 tracking-wider text-sm">{log.plate_text}</span>
                {log.has_violation && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                    Violation
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(log.checked_at)}</p>
            </div>

            <span className={`text-xs font-medium shrink-0 ${log.registered ? "text-green-600" : "text-red-500"}`}>
              {log.registered ? "Registered" : "Not registered"}
            </span>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
