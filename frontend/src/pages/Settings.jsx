import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BottomNav from "../components/BottomNav";

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-green-900 px-4 pt-12 pb-6">
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      <div className="px-4 py-6 space-y-4">
        {/* Account info */}
        {user && (
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-3 font-medium">Account</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Username</span>
                <span className="text-sm font-medium text-gray-900">{user.username}</span>
              </div>
              {user.badge_number && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Badge</span>
                  <span className="text-sm font-medium text-gray-900">{user.badge_number}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Logout */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-medium text-red-500">Sign Out</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
