import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useCategories, useCuisines, useTags } from "../lib/hooks";
import { RecipeGrid } from "../components/RecipeCard";
import { Pagination } from "../components/Pagination";
import { EmptyState, ErrorBox, Spinner } from "../components/ui";

const PAGE_SIZE = 12;

interface Filters {
  q: string;
  category: string;
  tag: string;
  cuisine: string;
  maxPrepTime: string;
  maxCalories: string;
  difficulty: string;
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  lactoseFree: boolean;
}

const EMPTY: Filters = {
  q: "",
  category: "",
  tag: "",
  cuisine: "",
  maxPrepTime: "",
  maxCalories: "",
  difficulty: "",
  vegan: false,
  vegetarian: false,
  glutenFree: false,
  lactoseFree: false,
};

export function SearchPage() {
  // `draft` holds the form; `applied` is what we actually query with.
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);

  const categories = useCategories();
  const tags = useTags();
  const cuisines = useCuisines();

  const query = useQuery({
    queryKey: ["search", applied, page],
    queryFn: () =>
      api.search({
        q: applied.q || undefined,
        category: applied.category || undefined,
        tag: applied.tag || undefined,
        cuisine: applied.cuisine || undefined,
        maxPrepTime: applied.maxPrepTime || undefined,
        maxCalories: applied.maxCalories || undefined,
        difficulty: applied.difficulty || undefined,
        vegan: applied.vegan || undefined,
        vegetarian: applied.vegetarian || undefined,
        glutenFree: applied.glutenFree || undefined,
        lactoseFree: applied.lactoseFree || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setApplied(draft);
    setPage(1);
  }
  function reset() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  }

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <div>
      <h1>Search & Filter</h1>

      <form className="filters card" onSubmit={apply}>
        <div className="filters-grid">
          <label className="field field-wide">
            <span>Full-text search</span>
            <input
              className="input"
              type="search"
              placeholder="e.g. spicy chicken pasta"
              value={draft.q}
              onChange={(e) => set("q", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Category</span>
            <select
              className="input"
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="">Any</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tag</span>
            <select
              className="input"
              value={draft.tag}
              onChange={(e) => set("tag", e.target.value)}
            >
              <option value="">Any</option>
              {tags.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Cuisine</span>
            <select
              className="input"
              value={draft.cuisine}
              onChange={(e) => set("cuisine", e.target.value)}
            >
              <option value="">Any</option>
              {cuisines.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Difficulty</span>
            <select
              className="input"
              value={draft.difficulty}
              onChange={(e) => set("difficulty", e.target.value)}
            >
              <option value="">Any</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label className="field">
            <span>Max prep time (min)</span>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.maxPrepTime}
              onChange={(e) => set("maxPrepTime", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Max calories</span>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.maxCalories}
              onChange={(e) => set("maxCalories", e.target.value)}
            />
          </label>
        </div>

        <fieldset className="dietary-toggles">
          <legend>Dietary</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.vegan}
              onChange={(e) => set("vegan", e.target.checked)}
            />
            Vegan
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.vegetarian}
              onChange={(e) => set("vegetarian", e.target.checked)}
            />
            Vegetarian
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.glutenFree}
              onChange={(e) => set("glutenFree", e.target.checked)}
            />
            Gluten-free
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.lactoseFree}
              onChange={(e) => set("lactoseFree", e.target.checked)}
            />
            Lactose-free
          </label>
        </fieldset>

        <div className="row gap">
          <button type="submit" className="btn btn-primary">
            Search
          </button>
          <button type="button" className="btn" onClick={reset}>
            Reset
          </button>
        </div>
      </form>

      {query.isLoading && <Spinner />}
      {query.isError && <ErrorBox error={query.error} />}
      {query.data && (
        <>
          <p className="muted small">{query.data.total} result(s)</p>
          {query.data.items.length === 0 ? (
            <EmptyState>No recipes match these filters.</EmptyState>
          ) : (
            <>
              <RecipeGrid recipes={query.data.items} />
              <Pagination
                page={query.data.page}
                totalPages={query.data.totalPages}
                onChange={setPage}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
