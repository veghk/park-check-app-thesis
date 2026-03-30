import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BottomNav from "../components/BottomNav";

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white pb-16">
      {/* Header */}
      <div className="bg-green-900 px-5 pt-14 pb-8">
        <p className="text-green-300 text-sm font-medium">Welcome back</p>
        <h1 className="text-2xl font-bold text-white mt-0.5">{user?.username}</h1>
      </div>

      {/* Cards */}
      <div className="px-5 py-6 space-y-3">
        {/* Check a plate */}
        <button
          onClick={() => navigate("/check")}
          className="w-full bg-white border border-gray-200 rounded-2xl p-5 flex items-center gap-4 hover:border-green-300 hover:shadow-sm transition-all active:scale-95 text-left"
        >
          <div className="bg-green-50 rounded-xl p-3 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 text-sm">Check a Plate</p>
            <p className="text-xs text-gray-500 mt-0.5">Scan a licence plate in real time</p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* History */}
        <button
          onClick={() => navigate("/history")}
          className="w-full bg-white border border-gray-200 rounded-2xl p-5 flex items-center gap-4 hover:border-green-300 hover:shadow-sm transition-all active:scale-95 text-left"
        >
          <div className="bg-green-50 rounded-xl p-3 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 text-sm">History</p>
            <p className="text-xs text-gray-500 mt-0.5">View your enforcement log</p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
