import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function CompanyRoute({ children }) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role !== "company_admin") return <Navigate to="/" replace />;
  return children;
}
