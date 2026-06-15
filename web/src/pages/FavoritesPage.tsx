import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { RecipeGrid } from "../components/RecipeCard";
import { EmptyState, ErrorBox, Spinner } from "../components/ui";

export function FavoritesPage() {
  const query = useQuery({
    queryKey: ["favorites"],
    queryFn: () => api.favorites().then((r) => r.items),
  });
  return (
    <div>
      <h1>Favorites</h1>
      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && query.data.length === 0 && (
        <EmptyState>No favorites yet. Tap ☆ on any recipe.</EmptyState>
      )}
      {query.data && query.data.length > 0 && (
        <RecipeGrid recipes={query.data} />
      )}
    </div>
  );
}
