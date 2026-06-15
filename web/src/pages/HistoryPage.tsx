import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { RecipeCard } from "../components/RecipeCard";
import { EmptyState, ErrorBox, Spinner } from "../components/ui";

export function HistoryPage() {
  const history = useQuery({
    queryKey: ["history"],
    queryFn: () => api.history().then((r) => r.items),
  });
  const want = useQuery({
    queryKey: ["want-to-cook"],
    queryFn: () => api.wantToCook().then((r) => r.items),
  });

  return (
    <div>
      <h1>Cooking History</h1>

      <section>
        <h2>Cooked</h2>
        {history.isLoading && <Spinner />}
        {history.isError && <ErrorBox error={history.error} />}
        {history.data && history.data.length === 0 && (
          <EmptyState>No cooked recipes yet.</EmptyState>
        )}
        {history.data && history.data.length > 0 && (
          <div className="recipe-grid">
            {history.data.map((h) => (
              <RecipeCard
                key={h.recipe.id}
                recipe={h.recipe}
                extra={
                  <div className="small muted mt">
                    Cooked {new Date(h.cookedAt).toLocaleDateString()}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-lg">
        <h2>Want to cook</h2>
        {want.isLoading && <Spinner />}
        {want.isError && <ErrorBox error={want.error} />}
        {want.data && want.data.length === 0 && (
          <EmptyState>Nothing on your want-to-cook list.</EmptyState>
        )}
        {want.data && want.data.length > 0 && (
          <div className="recipe-grid">
            {want.data.map((w) => (
              <RecipeCard
                key={w.recipe.id}
                recipe={w.recipe}
                extra={
                  <div className="small muted mt">
                    Saved {new Date(w.markedAt).toLocaleDateString()}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
