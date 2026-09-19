import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Database,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import { clsx } from "../components/clsx";
import { useAuthStore, useUIStore } from "../store/auth";

const NAV_ITEMS = [
  { to: "/", label: "工作台", icon: BarChart3, end: true },
  { to: "/dashboards", label: "仪表盘", icon: LayoutDashboard, end: false },
  { to: "/datasources", label: "数据源", icon: Database, end: false },
  { to: "/evals", label: "评测", icon: FlaskConical, end: false },
  { to: "/settings", label: "设置", icon: SettingsIcon, end: false },
];

export default function Shell() {
  const username = useAuthStore((s) => s.username);
  const logout = useAuthStore((s) => s.logout);
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-zinc-200 bg-white px-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600">
            <BarChart3 className="h-4 w-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">DataPilot</span>
        </div>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-teal-600/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={toggleTheme}
            title="切换深浅色"
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <div className="mx-1 hidden items-center gap-2 text-[13px] text-zinc-600 sm:flex dark:text-zinc-300">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {(username ?? "?").slice(0, 1).toUpperCase()}
            </div>
            {username}
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            title="退出登录"
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
