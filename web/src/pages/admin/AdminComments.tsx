import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Badge, EmptyState, ErrorBox, Spinner } from "../../components/ui";

// There is no "all comments" admin endpoint; admins moderate per-recipe.
// The admin recipe detail (/admin/recipes/:id) returns ALL comments incl.
// hidden, which is exactly what comment moderation needs.
export function AdminComments() {
  const qc = useQueryClient();
  const [recipeId, setRecipeId] = useState<number | "">("");

  const recipes = useQuery({
    queryKey: ["admin", "recipes", "for-comments"],
    queryFn: () => api.admin.recipes().then((r) => r.items),
  });

  const detail = useQuery({
    queryKey: ["admin", "recipe-detail", recipeId],
    queryFn: () => api.admin.recipe(Number(recipeId)).then((r) => r.recipe),
    enabled: recipeId !== "",
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin", "recipe-detail", recipeId] });
    qc.invalidateQueries({ queryKey: ["admin", "stats"] });
  }

  const hide = useMutation({
    mutationFn: (id: number) => api.admin.hideComment(id),
    onSuccess: invalidate,
  });
  const unhide = useMutation({
    mutationFn: (id: number) => api.admin.unhideComment(id),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: number) => api.admin.deleteComment(id),
    onSuccess: invalidate,
  });

  return (
    <div>
      <h2>Comment moderation</h2>
      <label className="field">
        <span>Pick a recipe to moderate its comments</span>
        <select
          className="input"
          value={recipeId}
          onChange={(e) =>
            setRecipeId(e.target.value === "" ? "" : Number(e.target.value))
          }
        >
          <option value="">Select a recipe…</option>
          {recipes.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} — {r.authorName}
            </option>
          ))}
        </select>
      </label>

      {recipeId !== "" && detail.isLoading && <Spinner />}
      {detail.isError && <ErrorBox error={detail.error} />}
      {detail.data && detail.data.comments.length === 0 && (
        <EmptyState>No comments on this recipe.</EmptyState>
      )}
      {detail.data && detail.data.comments.length > 0 && (
        <ul className="list">
          {detail.data.comments.map((c) => (
            <li key={c.id} className="list-row comment-mod">
              <div>
                <div>
                  <strong>{c.authorName}</strong>{" "}
                  {c.rating != null && (
                    <span className="star-filled">{"★".repeat(c.rating)}</span>
                  )}{" "}
                  {c.status === "hidden" && <Badge tone="red">hidden</Badge>}
                </div>
                {c.body && <p>{c.body}</p>}
                <div className="muted small">
                  {new Date(c.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="row gap">
                {c.status === "hidden" ? (
                  <button
                    className="btn btn-sm"
                    onClick={() => unhide.mutate(c.id)}
                  >
                    Unhide
                  </button>
                ) : (
                  <button
                    className="btn btn-sm"
                    onClick={() => hide.mutate(c.id)}
                  >
                    Hide
                  </button>
                )}
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    if (confirm("Delete this comment permanently?"))
                      del.mutate(c.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
