import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { EmptyState, ErrorBox, Spinner } from "../components/ui";

export function SubscriptionsPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api.subscriptions().then((r) => r.items),
  });
  const unsub = useMutation({
    mutationFn: (authorId: number) => api.unsubscribe(authorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });

  return (
    <div>
      <h1>Authors You Follow</h1>
      <p className="muted small">
        You'll be notified when these authors publish new recipes.
      </p>
      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && query.data.length === 0 && (
        <EmptyState>You're not following anyone yet.</EmptyState>
      )}
      {query.data && query.data.length > 0 && (
        <ul className="list">
          {query.data.map((s) => (
            <li key={s.authorId} className="list-row">
              <div>
                <Link to={`/authors/${s.authorId}`} className="strong">
                  {s.displayName}
                </Link>
                {s.bio && <div className="muted small">{s.bio}</div>}
                <div className="muted small">
                  Following since {new Date(s.since).toLocaleDateString()}
                </div>
              </div>
              <button
                className="btn btn-sm"
                onClick={() => unsub.mutate(s.authorId)}
                disabled={unsub.isPending}
              >
                Unfollow
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
