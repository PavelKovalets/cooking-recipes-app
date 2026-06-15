import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useIngredients } from "../lib/hooks";
import { RecipeCard } from "../components/RecipeCard";
import { Badge, EmptyState, ErrorBox, Spinner } from "../components/ui";

export function SmartSelectionPage() {
  // Smart selection takes non-basic ingredient ids on hand. Basics are always
  // assumed available, so we only show non-basic ingredients to pick from.
  const ingredients = useIngredients();
  const nonBasic = (ingredients.data ?? []).filter((i) => !i.isBasic);

  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState("");

  const run = useMutation({
    mutationFn: () => api.smartSelection(selected, 30).then((r) => r.items),
  });

  function toggle(id: number) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }

  const visible = nonBasic.filter((i) =>
    i.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const byId = new Map((ingredients.data ?? []).map((i) => [i.id, i.name]));

  return (
    <div>
      <h1>Smart Selection</h1>
      <p className="muted">
        Pick the ingredients you have on hand and we'll rank recipes by how few
        you're missing. Pantry basics (salt, oil, etc.) are always assumed
        available.
      </p>

      {ingredients.isLoading && <Spinner />}
      {ingredients.isError && <ErrorBox error={ingredients.error} />}

      {ingredients.data && (
        <div className="card">
          <input
            className="input"
            type="search"
            placeholder="Filter ingredients…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="chip-group mt">
            {visible.map((i) => (
              <label
                key={i.id}
                className={`chip ${selected.includes(i.id) ? "chip-on" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(i.id)}
                  onChange={() => toggle(i.id)}
                />
                {i.name}
              </label>
            ))}
          </div>
          <div className="row gap mt">
            <button
              className="btn btn-primary"
              onClick={() => run.mutate()}
              disabled={selected.length === 0 || run.isPending}
            >
              {run.isPending ? "Finding…" : `Find recipes (${selected.length})`}
            </button>
            {selected.length > 0 && (
              <button className="btn" onClick={() => setSelected([])}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {run.isError && <ErrorBox error={run.error} />}
      {run.data && (
        <div className="mt-lg">
          <h2>Results</h2>
          {run.data.length === 0 ? (
            <EmptyState>No matching recipes found.</EmptyState>
          ) : (
            <div className="recipe-grid">
              {run.data.map((item) => (
                <RecipeCard
                  key={item.recipe.id}
                  recipe={item.recipe}
                  extra={
                    <div className="mt">
                      {item.canCookNow ? (
                        <Badge tone="green">Can cook now ✓</Badge>
                      ) : (
                        <Badge tone="amber">
                          Missing {item.missingCount}:{" "}
                          {item.missingIngredientIds
                            .map((id) => byId.get(id) ?? `#${id}`)
                            .join(", ")}
                        </Badge>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
