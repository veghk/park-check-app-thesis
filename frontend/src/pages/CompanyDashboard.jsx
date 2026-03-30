import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import client from "../api/client";

export default function CompanyDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [enforcers,    setEnforcers]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showForm,     setShowForm]     = useState(false);
  const [form,         setForm]         = useState({ username: "", badge_number: "", password: "" });
  const [formError,    setFormError]    = useState("");
  const [formLoading,  setFormLoading]  = useState(false);
  const [installed,    setInstalled]    = useState(false);

  const installPrompt = window.__installPromptRef;

  useEffect(() => {
    client.get("/api/enforcers/")
      .then(({ data }) => setEnforcers(data))
      .finally(() => setLoading(false));
  }, []);

  async function handleInstall() {
    if (!installPrompt?.current) return;
    installPrompt.current.prompt();
    const { outcome } = await installPrompt.current.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      installPrompt.current = null;
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);
    try {
      const { data } = await client.post("/api/enforcers/", form);
      setEnforcers((prev) => [...prev, data]);
      setForm({ username: "", badge_number: "", password: "" });
      setShowForm(false);
    } catch (err) {
      const msg = err.response?.data;
      setFormError(
        typeof msg === "object"
          ? Object.values(msg).flat().join(" ")
          : "Failed to create enforcer."
      );
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id) {
    await client.delete(`/api/enforcers/${id}/`);
    setEnforcers((prev) => prev.filter((e) => e.id !== id));
    setDeleteTarget(null);
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const canInstall = installPrompt?.current && !installed;

  return (
    <div className="min-h-screen bg-white pb-10">
      {/* Header */}
      <div className="bg-green-900 px-5 pt-14 pb-8 flex items-start justify-between">
        <div>
          <p className="text-green-300 text-sm font-medium">Company admin</p>
          <h1 className="text-2xl font-bold text-white mt-0.5">{user?.company_name}</h1>
          <p className="text-green-400 text-xs mt-1">{user?.username}</p>
        </div>
        <button onClick={handleLogout}
          className="mt-1 text-green-300 text-sm border border-green-700 px-3 py-1.5 rounded-xl">
          Sign out
        </button>
      </div>

      <div className="px-5 py-6 space-y-6">

        {/* Install App */}
        <div className="border border-gray-200 rounded-2xl p-5">
          <p className="font-semibold text-gray-900 text-sm mb-1">Device Setup</p>
          <p className="text-xs text-gray-500 mb-4">
            Install the enforcement app on this device, then hand it to an enforcer to log in.
          </p>
          {installed ? (
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              App installed — hand device to enforcer
            </div>
          ) : canInstall ? (
            <button onClick={handleInstall}
              className="w-full py-3 bg-green-700 text-white text-sm font-semibold rounded-xl">
              Install App on this device
            </button>
          ) : (
            <p className="text-xs text-gray-400">
              App is already installed on this device, or open this page in Chrome/Edge to install.
            </p>
          )}
        </div>

        {/* Enforcer list */}
        <div>
          <p className="font-semibold text-gray-900 text-sm mb-3">
            Enforcers
            {!loading && <span className="text-gray-400 font-normal ml-1">({enforcers.length})</span>}
          </p>

          {loading && <p className="text-sm text-gray-400">Loading…</p>}

          {!loading && enforcers.length === 0 && (
            <p className="text-sm text-gray-400">No enforcers yet.</p>
          )}

          <div className="space-y-2">
            {enforcers.map((enforcer) => (
              <div key={enforcer.id}
                className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{enforcer.username}</p>
                  {enforcer.badge_number && (
                    <p className="text-xs text-gray-400">Badge #{enforcer.badge_number}</p>
                  )}
                </div>
                {deleteTarget === enforcer.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Delete?</span>
                    <button onClick={() => handleDelete(enforcer.id)}
                      className="text-xs text-red-600 font-semibold">Yes</button>
                    <button onClick={() => setDeleteTarget(null)}
                      className="text-xs text-gray-400">No</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteTarget(enforcer.id)}
                    className="text-gray-400 hover:text-red-500 p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Add Enforcer */}
        {showForm ? (
          <div className="border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-gray-900 text-sm">Add Enforcer</p>
              <button onClick={() => { setShowForm(false); setFormError(""); }}
                className="text-gray-400 text-xs">Cancel</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                type="text"
                placeholder="Username"
                required
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="text"
                placeholder="Badge number (optional)"
                value={form.badge_number}
                onChange={(e) => setForm((f) => ({ ...f, badge_number: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="password"
                placeholder="Password"
                required
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <button type="submit" disabled={formLoading}
                className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {formLoading ? "Creating…" : "Create Enforcer"}
              </button>
            </form>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 font-medium">
            + Add Enforcer
          </button>
        )}

      </div>
    </div>
  );
}
