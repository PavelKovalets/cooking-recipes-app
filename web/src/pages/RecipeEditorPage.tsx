import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  useCategories,
  useCuisines,
  useIngredients,
  useTags,
} from "../lib/hooks";
import { ErrorBox, Spinner } from "../components/ui";
import type {
  Difficulty,
  RecipeBody,
  RecipeDetail,
  RecipeIngredientInput,
  RecipeStepInput,
} from "../lib/types";

interface IngRow {
  ingredientId: number | "";
  quantity: string;
  unit: string;
}
interface StepRow {
  text: string;
  photoUrl: string;
}

function emptyForm() {
  return {
    title: "",
    description: "",
    cuisineId: "" as number | "",
    prepTimeMin: "" as number | "",
    cookTimeMin: "" as number | "",
    calories: "" as number | "",
    difficulty: "" as Difficulty | "",
    servings: "" as number | "",
    vegan: false,
    vegetarian: false,
    glutenFree: false,
    lactoseFree: false,
    categoryIds: [] as number[],
    tagIds: [] as number[],
    ingredients: [{ ingredientId: "", quantity: "", unit: "" }] as IngRow[],
    steps: [{ text: "", photoUrl: "" }] as StepRow[],
  };
}
type FormState = ReturnType<typeof emptyForm>;

function detailToForm(r: RecipeDetail): FormState {
  return {
    title: r.title,
    description: r.description ?? "",
    cuisineId: r.cuisineId ?? "",
    prepTimeMin: r.prepTimeMin ?? "",
    cookTimeMin: r.cookTimeMin ?? "",
    calories: r.calories ?? "",
    difficulty: r.difficulty ?? "",
    servings: r.servings ?? "",
    vegan: r.dietary.vegan,
    vegetarian: r.dietary.vegetarian,
    glutenFree: r.dietary.glutenFree,
    lactoseFree: r.dietary.lactoseFree,
    categoryIds: r.categories.map((c) => c.id),
    tagIds: r.tags.map((t) => t.id),
    ingredients:
      r.ingredients.length > 0
        ? r.ingredients.map((i) => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity ?? "",
            unit: i.unit ?? "",
          }))
        : [{ ingredientId: "", quantity: "", unit: "" }],
    steps:
      r.steps.length > 0
        ? r.steps.map((s) => ({ text: s.text, photoUrl: s.photoUrl ?? "" }))
        : [{ text: "", photoUrl: "" }],
  };
}

function toNum(v: number | ""): number | null {
  return v === "" ? null : Number(v);
}

export function RecipeEditorPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const isEdit = editId != null;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const categories = useCategories();
  const tags = useTags();
  const cuisines = useCuisines();
  const ingredients = useIngredients();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<unknown>(null);

  // Load existing recipe for edit.
  const existing = useQuery({
    queryKey: ["recipe-edit", editId],
    queryFn: () => api.recipe(editId!).then((r) => r.recipe),
    enabled: isEdit,
  });
  useEffect(() => {
    if (existing.data) setForm(detailToForm(existing.data));
  }, [existing.data]);

  function buildBody(): RecipeBody {
    const ingredientsClean: RecipeIngredientInput[] = form.ingredients
      .filter((i) => i.ingredientId !== "")
      .map((i) => ({
        ingredientId: Number(i.ingredientId),
        quantity: i.quantity || undefined,
        unit: i.unit || undefined,
      }));
    const stepsClean: RecipeStepInput[] = form.steps
      .filter((s) => s.text.trim() !== "")
      .map((s) => ({ text: s.text.trim(), photoUrl: s.photoUrl || undefined }));
    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      cuisineId: toNum(form.cuisineId),
      prepTimeMin: toNum(form.prepTimeMin),
      cookTimeMin: toNum(form.cookTimeMin),
      calories: toNum(form.calories),
      difficulty: form.difficulty === "" ? null : form.difficulty,
      servings: toNum(form.servings),
      vegan: form.vegan,
      vegetarian: form.vegetarian,
      glutenFree: form.glutenFree,
      lactoseFree: form.lactoseFree,
      categoryIds: form.categoryIds,
      tagIds: form.tagIds,
      ingredients: ingredientsClean,
      steps: stepsClean,
    };
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = buildBody();
      if (isEdit) {
        return api.updateRecipe(editId!, body).then((r) => r.recipe);
      }
      return api.createRecipe(body).then((r) => r.recipe);
    },
    onSuccess: (recipe) => {
      qc.invalidateQueries({ queryKey: ["my-recipes"] });
      qc.invalidateQueries({ queryKey: ["recipe"] });
      navigate(`/my-recipes/${recipe.id}/edit`, { replace: true });
      setError(null);
    },
    onError: (e) => setError(e),
  });

  // Photo upload only available once the recipe exists (needs an id).
  const photoUpload = useMutation({
    mutationFn: (file: File) => api.uploadPhoto(editId!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipe-edit", editId] });
      existing.refetch();
    },
  });

  if (isEdit && existing.isLoading) return <Spinner />;
  if (isEdit && existing.isError) return <ErrorBox error={existing.error} />;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleId(key: "categoryIds" | "tagIds", id: number) {
    setForm((f) => {
      const has = f[key].includes(id);
      return {
        ...f,
        [key]: has ? f[key].filter((x) => x !== id) : [...f[key], id],
      };
    });
  }

  return (
    <div className="editor">
      <h1>{isEdit ? "Edit recipe" : "New recipe"}</h1>
      {isEdit && existing.data && existing.data.status !== "published" && (
        <p className="banner">
          Status: <strong>{existing.data.status}</strong>. New submissions stay{" "}
          <em>pending</em> until an admin approves them.
        </p>
      )}

      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.title.trim()) {
            setError(new Error("Title is required."));
            return;
          }
          save.mutate();
        }}
      >
        <label className="field">
          <span>Title *</span>
          <input
            className="input"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            className="input"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>

        <div className="grid-4">
          <label className="field">
            <span>Cuisine</span>
            <select
              className="input"
              value={form.cuisineId}
              onChange={(e) =>
                set("cuisineId", e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">None</option>
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
              value={form.difficulty}
              onChange={(e) =>
                set("difficulty", e.target.value as Difficulty | "")
              }
            >
              <option value="">None</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="field">
            <span>Servings</span>
            <input
              className="input"
              type="number"
              min={0}
              value={form.servings}
              onChange={(e) =>
                set("servings", e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </label>
          <label className="field">
            <span>Calories</span>
            <input
              className="input"
              type="number"
              min={0}
              value={form.calories}
              onChange={(e) =>
                set("calories", e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </label>
          <label className="field">
            <span>Prep time (min)</span>
            <input
              className="input"
              type="number"
              min={0}
              value={form.prepTimeMin}
              onChange={(e) =>
                set(
                  "prepTimeMin",
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            />
          </label>
          <label className="field">
            <span>Cook time (min)</span>
            <input
              className="input"
              type="number"
              min={0}
              value={form.cookTimeMin}
              onChange={(e) =>
                set(
                  "cookTimeMin",
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            />
          </label>
        </div>

        <fieldset className="dietary-toggles">
          <legend>Dietary flags</legend>
          {(["vegan", "vegetarian", "glutenFree", "lactoseFree"] as const).map(
            (k) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  checked={form[k]}
                  onChange={(e) => set(k, e.target.checked)}
                />
                {k === "glutenFree"
                  ? "Gluten-free"
                  : k === "lactoseFree"
                    ? "Lactose-free"
                    : k.charAt(0).toUpperCase() + k.slice(1)}
              </label>
            ),
          )}
        </fieldset>

        <fieldset className="chip-group">
          <legend>Categories</legend>
          {categories.data?.map((c) => (
            <label
              key={c.id}
              className={`chip ${form.categoryIds.includes(c.id) ? "chip-on" : ""}`}
            >
              <input
                type="checkbox"
                checked={form.categoryIds.includes(c.id)}
                onChange={() => toggleId("categoryIds", c.id)}
              />
              {c.name}
            </label>
          ))}
        </fieldset>

        <fieldset className="chip-group">
          <legend>Tags</legend>
          {tags.data?.map((t) => (
            <label
              key={t.id}
              className={`chip ${form.tagIds.includes(t.id) ? "chip-on" : ""}`}
            >
              <input
                type="checkbox"
                checked={form.tagIds.includes(t.id)}
                onChange={() => toggleId("tagIds", t.id)}
              />
              #{t.name}
            </label>
          ))}
        </fieldset>

        {/* Ingredients */}
        <fieldset className="repeater">
          <legend>Ingredients</legend>
          {form.ingredients.map((row, idx) => (
            <div className="repeater-row" key={idx}>
              <select
                className="input"
                value={row.ingredientId}
                onChange={(e) => {
                  const v = e.target.value === "" ? "" : Number(e.target.value);
                  setForm((f) => {
                    const next = [...f.ingredients];
                    next[idx] = { ...next[idx]!, ingredientId: v };
                    return { ...f, ingredients: next };
                  });
                }}
              >
                <option value="">Select ingredient…</option>
                {ingredients.data?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.isBasic ? " (basic)" : ""}
                  </option>
                ))}
              </select>
              <input
                className="input input-sm"
                placeholder="Qty"
                value={row.quantity}
                onChange={(e) =>
                  setForm((f) => {
                    const next = [...f.ingredients];
                    next[idx] = { ...next[idx]!, quantity: e.target.value };
                    return { ...f, ingredients: next };
                  })
                }
              />
              <input
                className="input input-sm"
                placeholder="Unit"
                value={row.unit}
                onChange={(e) =>
                  setForm((f) => {
                    const next = [...f.ingredients];
                    next[idx] = { ...next[idx]!, unit: e.target.value };
                    return { ...f, ingredients: next };
                  })
                }
              />
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    ingredients: f.ingredients.filter((_, i) => i !== idx),
                  }))
                }
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              setForm((f) => ({
                ...f,
                ingredients: [
                  ...f.ingredients,
                  { ingredientId: "", quantity: "", unit: "" },
                ],
              }))
            }
          >
            + Add ingredient
          </button>
        </fieldset>

        {/* Steps */}
        <fieldset className="repeater">
          <legend>Steps (in order)</legend>
          {form.steps.map((row, idx) => (
            <div className="repeater-row step-row" key={idx}>
              <span className="step-num">{idx + 1}</span>
              <textarea
                className="input"
                rows={2}
                placeholder="Describe this step…"
                value={row.text}
                onChange={(e) =>
                  setForm((f) => {
                    const next = [...f.steps];
                    next[idx] = { ...next[idx]!, text: e.target.value };
                    return { ...f, steps: next };
                  })
                }
              />
              <input
                className="input input-sm"
                placeholder="Photo URL (optional)"
                value={row.photoUrl}
                onChange={(e) =>
                  setForm((f) => {
                    const next = [...f.steps];
                    next[idx] = { ...next[idx]!, photoUrl: e.target.value };
                    return { ...f, steps: next };
                  })
                }
              />
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    steps: f.steps.filter((_, i) => i !== idx),
                  }))
                }
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              setForm((f) => ({
                ...f,
                steps: [...f.steps, { text: "", photoUrl: "" }],
              }))
            }
          >
            + Add step
          </button>
        </fieldset>

        {error != null && <ErrorBox error={error} />}

        <div className="row gap">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={save.isPending}
          >
            {save.isPending
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : "Create recipe"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => navigate("/my-recipes")}
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Photo upload — only after the recipe exists */}
      {isEdit && existing.data && (
        <section className="photo-upload card">
          <h2>Photos</h2>
          <div className="photo-strip">
            {existing.data.photos.map((p) => (
              <img key={p.id} src={p.url} alt="" />
            ))}
            {existing.data.photos.length === 0 && (
              <span className="muted">No photos yet.</span>
            )}
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) photoUpload.mutate(file);
              e.target.value = "";
            }}
          />
          {photoUpload.isPending && <p className="muted">Uploading…</p>}
          {photoUpload.isError && <ErrorBox error={photoUpload.error} />}
        </section>
      )}
      {!isEdit && (
        <p className="muted small">
          Save the recipe first, then you can upload photos.
        </p>
      )}
    </div>
  );
}
