import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import CompanyRoute from "./components/CompanyRoute";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Home from "./pages/Home";
import Check from "./pages/Check";
import Settings from "./pages/Settings";
import History from "./pages/History";
import CompanyDashboard from "./pages/CompanyDashboard";

// Capture the PWA install prompt as early as possible so any page can use it.
// Stored in a module-level ref and exposed via window for CompanyDashboard to pick up.
const installPromptRef = { current: null };
window.__installPromptRef = installPromptRef;

function InstallPromptCapture() {
  useEffect(() => {
    function handle(e) {
      e.preventDefault();
      installPromptRef.current = e;
    }
    window.addEventListener("beforeinstallprompt", handle);
    return () => window.removeEventListener("beforeinstallprompt", handle);
  }, []);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <InstallPromptCapture />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<PrivateRoute><Setup /></PrivateRoute>} />
          <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
          <Route path="/check" element={<PrivateRoute><Check /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/history" element={<PrivateRoute><History /></PrivateRoute>} />
          <Route path="/company" element={<CompanyRoute><CompanyDashboard /></CompanyRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
