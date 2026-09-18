import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore, useUIStore } from "./store/auth";
import Login from "./pages/Login";
import Shell from "./pages/Shell";
import Workspace from "./pages/Workspace";
import DataSources from "./pages/DataSources";
import Settings from "./pages/Settings";
import Evals from "./pages/Evals";

export default function App() {
  const theme = useUIStore((s) => s.theme);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
      <Route element={token ? <Shell /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<Workspace />} />
        <Route path="/datasources" element={<DataSources />} />
        <Route path="/evals" element={<Evals />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
