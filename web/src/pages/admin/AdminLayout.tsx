import { NavLink, Outlet } from "react-router-dom";

const TABS: { to: string; label: string }[] = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/submissions", label: "Submissions" },
  { to: "/admin/recipes", label: "Recipes" },
  { to: "/admin/comments", label: "Comments" },
  { to: "/admin/complaints", label: "Complaints" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/taxonomy", label: "Taxonomy" },
];

export function AdminLayout() {
  return (
    <div className="admin">
      <h1>Admin</h1>
      <nav className="admin-tabs">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/admin"}
            className={({ isActive }) =>
              `admin-tab ${isActive ? "active" : ""}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="admin-body">
        <Outlet />
      </div>
    </div>
  );
}
