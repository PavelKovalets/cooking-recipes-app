import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { RecipeCard } from "../components/RecipeCard";
import { EmptyState, ErrorBox, Spinner } from "../components/ui";

export function MyRecipesPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["my-recipes"],
    queryFn: () => api.myRecipes().then((r) => r.items),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteRecipe(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-recipes"] }),
  });

  return (
    <div>
      <div className="page-head">
        <h1>My Recipes</h1>
        <Link to="/my-recipes/new" className="btn btn-primary">
          + New recipe
        </Link>
      </div>

      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && query.data.length === 0 && (
        <EmptyState>
          You haven't created any recipes yet.{" "}
          <Link to="/my-recipes/new">Create one</Link>.
        </EmptyState>
      )}
      {query.data && query.data.length > 0 && (
        <div className="recipe-grid">
          {query.data.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              showStatus
              extra={
                <div className="row gap mt">
                  <Link
                    to={`/my-recipes/${r.id}/edit`}
                    className="btn btn-sm"
                  >
                    Edit
                  </Link>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (confirm(`Delete "${r.title}"?`)) del.mutate(r.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
