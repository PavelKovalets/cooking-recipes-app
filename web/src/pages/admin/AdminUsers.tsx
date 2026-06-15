import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Badge, EmptyState, ErrorBox, Spinner } from "../../components/ui";

export function AdminUsers() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.admin.users().then((r) => r.items),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
    qc.invalidateQueries({ queryKey: ["admin", "stats"] });
  }

  const block = useMutation({
    mutationFn: (id: number) => api.admin.blockUser(id),
    onSuccess: invalidate,
  });
  const unblock = useMutation({
    mutationFn: (id: number) => api.admin.unblockUser(id),
    onSuccess: invalidate,
  });
  const setRole = useMutation({
    mutationFn: (v: { id: number; role: "registered" | "admin" }) =>
      api.admin.setUserRole(v.id, v.role),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: number) => api.admin.deleteUser(id),
    onSuccess: invalidate,
  });

  return (
    <div>
      <h2>Users</h2>
      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && query.data.length === 0 && (
        <EmptyState>No users.</EmptyState>
      )}
      {query.data && query.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Recipes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link to={`/admin/users/${u.id}`}>{u.displayName}</Link>
                </td>
                <td>{u.email}</td>
                <td>
                  <select
                    className="input input-sm"
                    value={u.role === "admin" ? "admin" : "registered"}
                    onChange={(e) =>
                      setRole.mutate({
                        id: u.id,
                        role: e.target.value as "registered" | "admin",
                      })
                    }
                  >
                    <option value="registered">registered</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td>
                  <Badge tone={u.status === "active" ? "green" : "red"}>
                    {u.status}
                  </Badge>
                </td>
                <td>{u.recipeCount}</td>
                <td className="row gap wrap">
                  {u.status === "active" ? (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => block.mutate(u.id)}
                    >
                      Block
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={() => unblock.mutate(u.id)}
                    >
                      Unblock
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete ${u.displayName}? This is permanent.`,
                        )
                      )
                        del.mutate(u.id);
                    }}
                  >
                    Delete
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
