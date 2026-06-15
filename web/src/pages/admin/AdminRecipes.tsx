import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Badge, EmptyState, ErrorBox, Spinner } from "../../components/ui";
import type { RecipeStatus } from "../../lib/types";

const STATUSES: (RecipeStatus | "")[] = [
  "",
  "published",
  "pending",
  "hidden",
  "draft",
];
const TONE: Record<string, string> = {
  published: "green",
  pending: "amber",
  hidden: "red",
  draft: "grey",
};

export function AdminRecipes() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RecipeStatus | "">("");

  const query = useQuery({
    queryKey: ["admin", "recipes", status],
    queryFn: () =>
      api.admin.recipes(status || undefined).then((r) => r.items),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin", "recipes"] });
    qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    qc.invalidateQueries({ queryKey: ["admin", "submissions"] });
  }

  const approve = useMutation({
    mutationFn: (id: number) => api.admin.approveRecipe(id),
    onSuccess: invalidate,
  });
  const hide = useMutation({
    mutationFn: (id: number) => api.admin.hideRecipe(id),
    onSuccess: invalidate,
  });
  const unhide = useMutation({
    mutationFn: (id: number) => api.admin.unhideRecipe(id),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: number) => api.admin.deleteRecipe(id),
    onSuccess: invalidate,
  });

  return (
    <div>
      <div className="page-head">
        <h2>All recipes</h2>
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value as RecipeStatus | "")}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "All statuses" : s}
            </option>
          ))}
        </select>
      </div>

      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && query.data.length === 0 && (
        <EmptyState>No recipes for this filter.</EmptyState>
      )}
      {query.data && query.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Status</th>
              <th>Rating</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/recipes/${r.id}`}>{r.title}</Link>
                </td>
                <td>{r.authorName}</td>
                <td>
                  <Badge tone={TONE[r.status] ?? "grey"}>{r.status}</Badge>
                </td>
                <td>
                  {r.rating.average != null
                    ? `${r.rating.average.toFixed(1)}★ (${r.rating.count})`
                    : "—"}
                </td>
                <td className="row gap wrap">
                  {r.status !== "published" && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => approve.mutate(r.id)}
                    >
                      Publish
                    </button>
                  )}
                  {r.status === "hidden" ? (
                    <button
                      className="btn btn-sm"
                      onClick={() => unhide.mutate(r.id)}
                    >
                      Unhide
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={() => hide.mutate(r.id)}
                    >
                      Hide
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (confirm(`Permanently delete "${r.title}"?`))
                        del.mutate(r.id);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
