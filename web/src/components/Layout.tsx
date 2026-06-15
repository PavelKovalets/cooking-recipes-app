import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useUnreadCount } from "../lib/hooks";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
      end={to === "/"}
    >
      {label}
    </NavLink>
  );
}

export function Layout() {
  const { user, isAdmin, isRegistered, logout } = useAuth();
  const navigate = useNavigate();
  const unread = useUnreadCount();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            🍳 Recipes
          </Link>
          <nav className="nav">
            {/* Guest-visible */}
            <NavItem to="/" label="Catalog" />
            <NavItem to="/search" label="Search" />
            <NavItem to="/smart-selection" label="Smart Selection" />

            {/* Registered-user */}
            {isRegistered && (
              <>
                <NavItem to="/recommendations" label="For You" />
                <NavItem to="/my-recipes" label="My Recipes" />
                <NavItem to="/favorites" label="Favorites" />
                <NavItem to="/history" label="History" />
                <NavItem to="/subscriptions" label="Following" />
                <NavLink
                  to="/notifications"
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                >
                  Notifications
                  {unread.data ? (
                    <span className="nav-badge">{unread.data}</span>
                  ) : null}
                </NavLink>
              </>
            )}

            {/* Admin */}
            {isAdmin && <NavItem to="/admin" label="Admin" />}
          </nav>

          <div className="nav-auth">
            {isRegistered ? (
              <>
                <Link to="/profile" className="nav-user">
                  {user?.displayName}
                  {isAdmin ? " (admin)" : ""}
                </Link>
                <button className="btn btn-sm" onClick={handleLogout}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-sm">
                  Log in
                </Link>
                <Link to="/register" className="btn btn-sm btn-primary">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
