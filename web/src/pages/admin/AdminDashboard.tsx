import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { ErrorBox, Spinner } from "../../components/ui";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function AdminDashboard() {
  const query = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.admin.stats(),
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorBox error={query.error} />;
  const s = query.data!;

  return (
    <div className="dashboard">
      <h2>Recipes</h2>
      <div className="stat-grid">
        <StatCard label="Total" value={s.recipes.total} />
        <StatCard label="Published" value={s.recipes.published} />
        <StatCard label="Pending" value={s.recipes.pending} />
        <StatCard label="Hidden" value={s.recipes.hidden} />
        <StatCard label="Draft" value={s.recipes.draft} />
      </div>

      <h2>Users</h2>
      <div className="stat-grid">
        <StatCard label="Total" value={s.users.total} />
        <StatCard label="Active" value={s.users.active} />
        <StatCard label="Blocked" value={s.users.blocked} />
        <StatCard label="Admins" value={s.users.admins} />
        <StatCard label="Authors" value={s.users.authors} />
      </div>

      <h2>Engagement</h2>
      <div className="stat-grid">
        <StatCard label="Comments" value={s.engagement.comments} />
        <StatCard label="Ratings" value={s.engagement.ratings} />
        <StatCard label="Favorites" value={s.engagement.favorites} />
        <StatCard label="Cooked marks" value={s.engagement.cookedMarks} />
        <StatCard label="Subscriptions" value={s.engagement.subscriptions} />
      </div>

      <h2>Moderation queue</h2>
      <div className="stat-grid">
        <StatCard label="Open complaints" value={s.moderation.openComplaints} />
        <StatCard label="Pending recipes" value={s.moderation.pendingRecipes} />
        <StatCard label="Hidden comments" value={s.moderation.hiddenComments} />
      </div>

      <div className="dash-cols">
        <section>
          <h2>Popular categories</h2>
          <ul className="list">
            {s.popularCategories.map((c) => (
              <li key={c.categoryId} className="list-row">
                <span>{c.name}</span>
                <span className="muted">{c.recipeCount} recipes</span>
              </li>
            ))}
            {s.popularCategories.length === 0 && (
              <li className="muted">No data</li>
            )}
          </ul>
        </section>

        <section>
          <h2>Top rated recipes</h2>
          <ul className="list">
            {s.topRatedRecipes.map((r) => (
              <li key={r.recipeId} className="list-row">
                <Link to={`/recipes/${r.recipeId}`}>{r.title}</Link>
                <span className="muted">
                  {r.averageRating.toFixed(1)}★ ({r.ratingCount})
                </span>
              </li>
            ))}
            {s.topRatedRecipes.length === 0 && (
              <li className="muted">No data</li>
            )}
          </ul>
        </section>

        <section>
          <h2>Most active users</h2>
          <ul className="list">
            {s.mostActiveUsers.map((u) => (
              <li key={u.userId} className="list-row">
                <span>{u.displayName}</span>
                <span className="muted">
                  {u.recipeCount} recipes · {u.commentCount} comments
                </span>
              </li>
            ))}
            {s.mostActiveUsers.length === 0 && (
              <li className="muted">No data</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
