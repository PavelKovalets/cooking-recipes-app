import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { EmptyState, ErrorBox, Spinner } from "../components/ui";
import type { AppNotification } from "../lib/types";

function describe(n: AppNotification): React.ReactNode {
  const p = n.payload as Record<string, unknown>;
  switch (n.type) {
    case "new_comment":
      return (
        <>
          New comment on your recipe{" "}
          {typeof p.recipeId === "number" && (
            <Link to={`/recipes/${p.recipeId}`}>#{p.recipeId}</Link>
          )}
        </>
      );
    case "new_rating":
      return (
        <>
          New rating ({String(p.rating ?? "?")}★) on your recipe{" "}
          {typeof p.recipeId === "number" && (
            <Link to={`/recipes/${p.recipeId}`}>#{p.recipeId}</Link>
          )}
        </>
      );
    case "new_recipe_from_author":
      return (
        <>
          New recipe from an author you follow:{" "}
          {typeof p.recipeSlug === "string" ? (
            <Link to={`/recipes/${p.recipeSlug}`}>
              {String(p.recipeTitle ?? "View recipe")}
            </Link>
          ) : (
            String(p.recipeTitle ?? "View recipe")
          )}
        </>
      );
    default:
      return <>Notification</>;
  }
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", "all"],
    queryFn: () => api.notifications(),
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api.markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const markAll = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return (
    <div>
      <div className="page-head">
        <h1>
          Notifications
          {query.data && query.data.unreadCount > 0
            ? ` (${query.data.unreadCount} unread)`
            : ""}
        </h1>
        {query.data && query.data.unreadCount > 0 && (
          <button
            className="btn btn-sm"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
          >
            Mark all read
          </button>
        )}
      </div>

      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState>No notifications.</EmptyState>
      )}
      {query.data && query.data.items.length > 0 && (
        <ul className="list">
          {query.data.items.map((n) => (
            <li
              key={n.id}
              className={`list-row notif ${n.read ? "" : "notif-unread"}`}
            >
              <div>
                <div>{describe(n)}</div>
                <div className="muted small">
                  {new Date(n.createdAt).toLocaleString()}
                </div>
              </div>
              {!n.read && (
                <button
                  className="btn btn-sm"
                  onClick={() => markRead.mutate(n.id)}
                  disabled={markRead.isPending}
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
