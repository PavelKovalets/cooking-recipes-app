import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Badge, EmptyState, ErrorBox, Spinner } from "../../components/ui";

function targetLink(type: string, id: number): React.ReactNode {
  if (type === "recipe") return <Link to={`/recipes/${id}`}>recipe #{id}</Link>;
  if (type === "user") return <Link to={`/admin/users/${id}`}>user #{id}</Link>;
  return `comment #${id}`;
}

export function AdminComplaints() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"open" | "resolved" | "">("open");

  const query = useQuery({
    queryKey: ["admin", "complaints", filter],
    queryFn: () =>
      api.admin.complaints(filter || undefined).then((r) => r.items),
  });

  const resolve = useMutation({
    mutationFn: (id: number) => api.admin.resolveComplaint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "complaints"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  return (
    <div>
      <div className="page-head">
        <h2>Complaints</h2>
        <select
          className="input"
          value={filter}
          onChange={(e) =>
            setFilter(e.target.value as "open" | "resolved" | "")
          }
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="">All</option>
        </select>
      </div>

      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && query.data.length === 0 && (
        <EmptyState>No complaints.</EmptyState>
      )}
      {query.data && query.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Reporter</th>
              <th>Target</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Filed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((c) => (
              <tr key={c.id}>
                <td>{c.reporterName}</td>
                <td>{targetLink(c.targetType, c.targetId)}</td>
                <td>{c.reason}</td>
                <td>
                  <Badge tone={c.status === "open" ? "amber" : "green"}>
                    {c.status}
                  </Badge>
                </td>
                <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td>
                  {c.status === "open" && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => resolve.mutate(c.id)}
                      disabled={resolve.isPending}
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
