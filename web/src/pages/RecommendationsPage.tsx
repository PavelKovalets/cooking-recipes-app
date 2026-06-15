import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { RecipeCard } from "../components/RecipeCard";
import { Badge, EmptyState, ErrorBox, Spinner } from "../components/ui";

export function RecommendationsPage() {
  const query = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => api.recommendations(20).then((r) => r.items),
  });

  return (
    <div>
      <h1>Recommended For You</h1>
      <p className="muted small">
        Based on recipes you've cooked and favorited, excluding diets/allergies
        you've set.
      </p>
      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && query.data.length === 0 && (
        <EmptyState>
          No recommendations yet — cook or favorite a few recipes to seed your
          taste profile.
        </EmptyState>
      )}
      {query.data && query.data.length > 0 && (
        <div className="recipe-grid">
          {query.data.map((item) => (
            <RecipeCard
              key={item.recipe.id}
              recipe={item.recipe}
              extra={
                <div className="mt">
                  <Badge tone="blue">match {item.score.toFixed(2)}</Badge>
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
