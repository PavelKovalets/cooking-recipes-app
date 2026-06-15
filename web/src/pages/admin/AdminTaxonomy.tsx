import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { Badge, ErrorBox, Spinner } from "../../components/ui";
import {
  useCategories,
  useCuisines,
  useIngredients,
  useTags,
} from "../../lib/hooks";

export function AdminTaxonomy() {
  return (
    <div className="taxonomy">
      <CategoriesSection />
      <TagsSection />
      <CuisinesSection />
      <IngredientsSection />
    </div>
  );
}

function CategoriesSection() {
  const qc = useQueryClient();
  const list = useCategories();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["categories"] });
  const create = useMutation({
    mutationFn: () => api.admin.createCategory({ name, description: description || undefined }),
    onSuccess: () => {
      setName("");
      setDescription("");
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: () =>
      api.admin.updateCategory(editId!, { name, description: description || undefined }),
    onSuccess: () => {
      setEditId(null);
      setName("");
      setDescription("");
      refresh();
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.admin.deleteCategory(id),
    onSuccess: refresh,
  });

  return (
    <section className="card taxo-section">
      <h2>Categories</h2>
      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBox error={list.error} />}
      <ul className="list">
        {list.data?.map((c) => (
          <li key={c.id} className="list-row">
            <span>
              {c.name}{" "}
              {c.description && <span className="muted small">— {c.description}</span>}
            </span>
            <span className="row gap">
              <button
                className="btn btn-sm"
                onClick={() => {
                  setEditId(c.id);
                  setName(c.name);
                  setDescription(c.description ?? "");
                }}
              >
                Edit
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => del.mutate(c.id)}
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      {del.isError && <ErrorBox error={del.error} />}
      <div className="row gap wrap mt">
        <input
          className="input"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {editId == null ? (
          <button
            className="btn btn-primary"
            disabled={!name || create.isPending}
            onClick={() => create.mutate()}
          >
            Add
          </button>
        ) : (
          <>
            <button
              className="btn btn-primary"
              disabled={!name || update.isPending}
              onClick={() => update.mutate()}
            >
              Save
            </button>
            <button
              className="btn"
              onClick={() => {
                setEditId(null);
                setName("");
                setDescription("");
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {(create.isError || update.isError) && (
        <ErrorBox error={create.error ?? update.error} />
      )}
    </section>
  );
}

// Generic name-only CRUD for tags & cuisines.
function NameSection({
  title,
  list,
  onCreate,
  onUpdate,
  onDelete,
  invalidateKey,
}: {
  title: string;
  list: { isLoading: boolean; isError: boolean; error: unknown; data?: { id: number; name: string }[] };
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (id: number, name: string) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  invalidateKey: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: [invalidateKey] });

  const create = useMutation({
    mutationFn: () => onCreate(name),
    onSuccess: () => {
      setName("");
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: () => onUpdate(editId!, name),
    onSuccess: () => {
      setEditId(null);
      setName("");
      refresh();
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => onDelete(id),
    onSuccess: refresh,
  });

  return (
    <section className="card taxo-section">
      <h2>{title}</h2>
      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBox error={list.error} />}
      <ul className="list">
        {list.data?.map((item) => (
          <li key={item.id} className="list-row">
            <span>{item.name}</span>
            <span className="row gap">
              <button
                className="btn btn-sm"
                onClick={() => {
                  setEditId(item.id);
                  setName(item.name);
                }}
              >
                Edit
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => del.mutate(item.id)}
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      {del.isError && <ErrorBox error={del.error} />}
      <div className="row gap wrap mt">
        <input
          className="input"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {editId == null ? (
          <button
            className="btn btn-primary"
            disabled={!name || create.isPending}
            onClick={() => create.mutate()}
          >
            Add
          </button>
        ) : (
          <>
            <button
              className="btn btn-primary"
              disabled={!name || update.isPending}
              onClick={() => update.mutate()}
            >
              Save
            </button>
            <button
              className="btn"
              onClick={() => {
                setEditId(null);
                setName("");
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {(create.isError || update.isError) && (
        <ErrorBox error={create.error ?? update.error} />
      )}
    </section>
  );
}

function TagsSection() {
  const list = useTags();
  return (
    <NameSection
      title="Tags"
      list={list}
      invalidateKey="tags"
      onCreate={(name) => api.admin.createTag({ name })}
      onUpdate={(id, name) => api.admin.updateTag(id, { name })}
      onDelete={(id) => api.admin.deleteTag(id)}
    />
  );
}

function CuisinesSection() {
  const list = useCuisines();
  return (
    <NameSection
      title="Cuisines"
      list={list}
      invalidateKey="cuisines"
      onCreate={(name) => api.admin.createCuisine({ name })}
      onUpdate={(id, name) => api.admin.updateCuisine(id, { name })}
      onDelete={(id) => api.admin.deleteCuisine(id)}
    />
  );
}

function IngredientsSection() {
  const qc = useQueryClient();
  const list = useIngredients();
  const [name, setName] = useState("");
  const [isBasic, setIsBasic] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["ingredients"] });
  const create = useMutation({
    mutationFn: () => api.admin.createIngredient({ name, isBasic }),
    onSuccess: () => {
      setName("");
      setIsBasic(false);
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: () => api.admin.updateIngredient(editId!, { name, isBasic }),
    onSuccess: () => {
      setEditId(null);
      setName("");
      setIsBasic(false);
      refresh();
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.admin.deleteIngredient(id),
    onSuccess: refresh,
  });

  return (
    <section className="card taxo-section taxo-wide">
      <h2>Ingredients</h2>
      <p className="muted small">
        Mark pantry staples as <strong>basic</strong> — they're assumed
        always-available in smart selection.
      </p>
      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBox error={list.error} />}
      <ul className="list ingredient-admin-list">
        {list.data?.map((i) => (
          <li key={i.id} className="list-row">
            <span>
              {i.name} {i.isBasic && <Badge tone="grey">basic</Badge>}
            </span>
            <span className="row gap">
              <button
                className="btn btn-sm"
                onClick={() => {
                  setEditId(i.id);
                  setName(i.name);
                  setIsBasic(i.isBasic);
                }}
              >
                Edit
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => del.mutate(i.id)}
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      {del.isError && (
        <ErrorBox
          error={
            del.error instanceof ApiError && del.error.status === 409
              ? new Error(
                  "Cannot delete: this ingredient is used by a recipe.",
                )
              : del.error
          }
        />
      )}
      <div className="row gap wrap mt">
        <input
          className="input"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={isBasic}
            onChange={(e) => setIsBasic(e.target.checked)}
          />
          Basic
        </label>
        {editId == null ? (
          <button
            className="btn btn-primary"
            disabled={!name || create.isPending}
            onClick={() => create.mutate()}
          >
            Add
          </button>
        ) : (
          <>
            <button
              className="btn btn-primary"
              disabled={!name || update.isPending}
              onClick={() => update.mutate()}
            >
              Save
            </button>
            <button
              className="btn"
              onClick={() => {
                setEditId(null);
                setName("");
                setIsBasic(false);
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {(create.isError || update.isError) && (
        <ErrorBox error={create.error ?? update.error} />
      )}
    </section>
  );
}
