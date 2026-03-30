import { useState } from "react";
import client from "../api/client";

export default function ViolationModal({ check_log_id, plate_text, onClose, onIssued }) {
  const [notes,     setNotes]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    setError("");
    try {
      await client.post("/api/violations/", { check_log_id, notes });
      setSubmitted(true);
      setTimeout(onIssued ?? onClose, 1200);
    } catch (e) {
      setError(e.response?.data?.error ?? "Failed to issue violation. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div className="w-full max-w-md bg-white rounded-t-3xl px-6 pt-5 pb-10 safe-area-pb">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-800 font-semibold">Violation issued</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Issue Violation</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-red-500 font-medium uppercase tracking-wide mb-0.5">Unregistered plate</p>
              <p className="text-xl font-bold text-red-700 tracking-widest">{plate_text}</p>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. blocking fire exit, no permit visible…"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
            />

            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

            <div className="flex gap-3 mt-5">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {loading ? "Issuing…" : "Confirm"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
