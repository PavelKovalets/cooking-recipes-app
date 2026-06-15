import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useIngredients } from "../lib/hooks";
import { ErrorBox, Spinner } from "../components/ui";
import type { Preferences } from "../lib/types";

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const ingredients = useIngredients();

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");

  const profileSave = useMutation({
    mutationFn: () =>
      api.updateMe({
        displayName,
        bio,
        avatarUrl: avatarUrl || undefined,
      }),
    onSuccess: (res) => setUser(res.user),
  });

  // Preferences
  const prefsQuery = useQuery({
    queryKey: ["preferences"],
    queryFn: () => api.getPreferences().then((r) => r.preferences),
  });
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  useEffect(() => {
    if (prefsQuery.data) setPrefs(prefsQuery.data);
  }, [prefsQuery.data]);

  const prefsSave = useMutation({
    mutationFn: () => api.updatePreferences(prefs!),
    onSuccess: (res) => {
      setPrefs(res.preferences);
      qc.invalidateQueries({ queryKey: ["preferences"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  function toggleIng(field: "allergies" | "dislikedIngredients", id: number) {
    setPrefs((p) =>
      p
        ? {
            ...p,
            [field]: p[field].includes(id)
              ? p[field].filter((x) => x !== id)
              : [...p[field], id],
          }
        : p,
    );
  }

  return (
    <div className="profile">
      <h1>Profile & Settings</h1>

      <section className="card">
        <h2>Account</h2>
        <p className="muted small">{user?.email}</p>
        <label className="field">
          <span>Display name</span>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea
            className="input"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Avatar URL</span>
          <input
            className="input"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
        </label>
        {profileSave.isError && <ErrorBox error={profileSave.error} />}
        <button
          className="btn btn-primary"
          onClick={() => profileSave.mutate()}
          disabled={profileSave.isPending}
        >
          {profileSave.isPending
            ? "Saving…"
            : profileSave.isSuccess
              ? "Saved ✓"
              : "Save account"}
        </button>
      </section>

      <section className="card">
        <h2>Culinary preferences</h2>
        <p className="muted small">
          These drive recommendations and let us flag recipes that don't fit
          your diet/allergies.
        </p>
        {prefsQuery.isLoading && <Spinner />}
        {prefsQuery.isError && <ErrorBox error={prefsQuery.error} />}
        {prefs && (
          <>
            <fieldset className="dietary-toggles">
              <legend>Diets</legend>
              {(
                ["vegan", "vegetarian", "glutenFree", "lactoseFree"] as const
              ).map((k) => (
                <label className="check" key={k}>
                  <input
                    type="checkbox"
                    checked={prefs[k]}
                    onChange={(e) =>
                      setPrefs({ ...prefs, [k]: e.target.checked })
                    }
                  />
                  {k === "glutenFree"
                    ? "Gluten-free"
                    : k === "lactoseFree"
                      ? "Lactose-free"
                      : k.charAt(0).toUpperCase() + k.slice(1)}
                </label>
              ))}
            </fieldset>

            {ingredients.data && (
              <>
                <fieldset className="chip-group">
                  <legend>Allergies (ingredients to always exclude)</legend>
                  {ingredients.data.map((i) => (
                    <label
                      key={i.id}
                      className={`chip ${prefs.allergies.includes(i.id) ? "chip-on chip-red" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={prefs.allergies.includes(i.id)}
                        onChange={() => toggleIng("allergies", i.id)}
                      />
                      {i.name}
                    </label>
                  ))}
                </fieldset>

                <fieldset className="chip-group">
                  <legend>Disliked ingredients</legend>
                  {ingredients.data.map((i) => (
                    <label
                      key={i.id}
                      className={`chip ${prefs.dislikedIngredients.includes(i.id) ? "chip-on" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={prefs.dislikedIngredients.includes(i.id)}
                        onChange={() =>
                          toggleIng("dislikedIngredients", i.id)
                        }
                      />
                      {i.name}
                    </label>
                  ))}
                </fieldset>
              </>
            )}

            {prefsSave.isError && <ErrorBox error={prefsSave.error} />}
            <button
              className="btn btn-primary"
              onClick={() => prefsSave.mutate()}
              disabled={prefsSave.isPending}
            >
              {prefsSave.isPending
                ? "Saving…"
                : prefsSave.isSuccess
                  ? "Saved ✓"
                  : "Save preferences"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
