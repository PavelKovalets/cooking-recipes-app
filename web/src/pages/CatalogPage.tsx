import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { RecipeGrid } from "../components/RecipeCard";
import { Pagination } from "../components/Pagination";
import { EmptyState, ErrorBox, Spinner } from "../components/ui";

const PAGE_SIZE = 12;

export function CatalogPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  const query = useQuery({
    queryKey: ["recipes", page, sort],
    queryFn: () => api.recipes({ page, pageSize: PAGE_SIZE, sort }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Recipe Catalog</h1>
          <p className="muted">Browse published recipes from the community.</p>
        </div>
        <div className="row gap">
          <Link to="/search" className="btn">
            Advanced search & filters
          </Link>
          <select
            className="input"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as "newest" | "oldest");
              setPage(1);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>

      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState>No recipes yet.</EmptyState>
      )}
      {query.data && query.data.items.length > 0 && (
        <>
          <RecipeGrid recipes={query.data.items} />
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
