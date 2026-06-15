import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { EmptyState, ErrorBox, Spinner } from "../../components/ui";

export function AdminSubmissions() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "submissions"],
    queryFn: () => api.admin.submissions().then((r) => r.items),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin", "submissions"] });
    qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    qc.invalidateQueries({ queryKey: ["admin", "recipes"] });
  }

  const approve = useMutation({
    mutationFn: (id: number) => api.admin.approveRecipe(id),
    onSuccess: invalidate,
  });
  const hide = useMutation({
    mutationFn: (id: number) => api.admin.hideRecipe(id),
    onSuccess: invalidate,
  });

  return (
    <div>
      <h2>Pending submissions</h2>
      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && query.data.length === 0 && (
        <EmptyState>No pending submissions. 🎉</EmptyState>
      )}
      {query.data && query.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((r) => (
              <tr key={r.id}>
                <td>
                  {/* Admins can preview pending recipes by numeric id */}
                  <Link to={`/recipes/${r.id}`}>{r.title}</Link>
                </td>
                <td>{r.authorName}</td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="row gap">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => approve.mutate(r.id)}
                    disabled={approve.isPending}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => hide.mutate(r.id)}
                    disabled={hide.isPending}
                  >
                    Hide
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
