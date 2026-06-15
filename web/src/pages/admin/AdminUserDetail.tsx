import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { RecipeCard } from "../../components/RecipeCard";
import { Badge, EmptyState, ErrorBox, Spinner } from "../../components/ui";

export function AdminUserDetail() {
  const { id = "" } = useParams();
  const userId = Number(id);
  const qc = useQueryClient();

  const user = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => api.admin.user(userId).then((r) => r.user),
  });
  const recipes = useQuery({
    queryKey: ["admin", "user-recipes", userId],
    queryFn: () => api.recipes({ authorId: userId, pageSize: 50 }).then((r) => r.items),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin", "user", userId] });
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  const block = useMutation({
    mutationFn: () => api.admin.blockUser(userId),
    onSuccess: invalidate,
  });
  const unblock = useMutation({
    mutationFn: () => api.admin.unblockUser(userId),
    onSuccess: invalidate,
  });

  if (user.isLoading) return <Spinner />;
  if (user.isError) return <ErrorBox error={user.error} />;
  const u = user.data!;

  return (
    <div>
      <Link to="/admin/users" className="muted small">
        ← Back to users
      </Link>
      <div className="page-head">
        <div>
          <h2>{u.displayName}</h2>
          <div className="muted">{u.email}</div>
          <div className="row gap mt">
            <Badge tone={u.role === "admin" ? "blue" : "grey"}>{u.role}</Badge>
            <Badge tone={u.status === "active" ? "green" : "red"}>
              {u.status}
            </Badge>
            <span className="muted small">{u.recipeCount} recipes</span>
          </div>
          {u.bio && <p>{u.bio}</p>}
        </div>
        <div>
          {u.status === "active" ? (
            <button
              className="btn btn-danger"
              onClick={() => block.mutate()}
              disabled={block.isPending}
            >
              Block user
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => unblock.mutate()}
              disabled={unblock.isPending}
            >
              Unblock user
            </button>
          )}
        </div>
      </div>

      <h3>Published recipes</h3>
      {recipes.isLoading && <Spinner />}
      {recipes.data && recipes.data.length === 0 && (
        <EmptyState>No published recipes.</EmptyState>
      )}
      {recipes.data && recipes.data.length > 0 && (
        <div className="recipe-grid">
          {recipes.data.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </div>
  );
}
