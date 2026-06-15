import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { RecipeGrid } from "../components/RecipeCard";
import { EmptyState, ErrorBox, Spinner } from "../components/ui";

export function AuthorPage() {
  const { id = "" } = useParams();
  const authorId = Number(id);
  const { isRegistered, user } = useAuth();
  const qc = useQueryClient();

  const recipes = useQuery({
    queryKey: ["author-recipes", authorId],
    queryFn: () =>
      api.recipes({ authorId, pageSize: 50 }).then((r) => r.items),
  });

  const subs = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api.subscriptions().then((r) => r.items),
    enabled: isRegistered,
  });
  const isSubscribed = !!subs.data?.some((s) => s.authorId === authorId);
  const isSelf = user?.id === authorId;

  const subMutation = useMutation({
    mutationFn: () =>
      isSubscribed ? api.unsubscribe(authorId) : api.subscribe(authorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });

  const authorName = recipes.data?.[0]?.authorName ?? `Author #${authorId}`;

  return (
    <div>
      <div className="page-head">
        <h1>{authorName}</h1>
        {isRegistered && !isSelf && (
          <button
            className={`btn ${isSubscribed ? "btn-active" : "btn-primary"}`}
            onClick={() => subMutation.mutate()}
            disabled={subMutation.isPending}
          >
            {isSubscribed ? "✓ Following" : "Follow author"}
          </button>
        )}
      </div>

      {recipes.isLoading && <Spinner />}
      {recipes.isError && <ErrorBox error={recipes.error} />}
      {recipes.data && recipes.data.length === 0 && (
        <EmptyState>This author has no published recipes.</EmptyState>
      )}
      {recipes.data && recipes.data.length > 0 && (
        <RecipeGrid recipes={recipes.data} />
      )}
    </div>
  );
}
