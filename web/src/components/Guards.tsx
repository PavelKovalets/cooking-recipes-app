import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./ui";

// Requires a logged-in registered user (admins included).
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isRegistered, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!isRegistered) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

// Requires an admin.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
