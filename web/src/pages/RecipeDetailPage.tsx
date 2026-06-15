import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  Badge,
  DietaryBadges,
  ErrorBox,
  Spinner,
  Stars,
} from "../components/ui";
import type { Comment } from "../lib/types";

export function RecipeDetailPage() {
  const { idOrSlug = "" } = useParams();
  const { user, isRegistered } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["recipe", idOrSlug],
    queryFn: () => api.recipe(idOrSlug).then((r) => r.recipe),
  });

  // Favorites/cook-status: we don't have a per-recipe status endpoint, so we
  // derive the toggle's current state from the user's lists.
  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () => api.favorites().then((r) => r.items),
    enabled: isRegistered,
  });
  const wantList = useQuery({
    queryKey: ["want-to-cook"],
    queryFn: () => api.wantToCook().then((r) => r.items),
    enabled: isRegistered,
  });
  const history = useQuery({
    queryKey: ["history"],
    queryFn: () => api.history().then((r) => r.items),
    enabled: isRegistered,
  });
  const subscriptions = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api.subscriptions().then((r) => r.items),
    enabled: isRegistered,
  });

  const recipe = query.data;
  const isFavorited =
    !!recipe && !!favorites.data?.some((r) => r.id === recipe.id);
  const wantsToCook =
    !!recipe && !!wantList.data?.some((w) => w.recipe.id === recipe.id);
  const hasCooked =
    !!recipe && !!history.data?.some((h) => h.recipe.id === recipe.id);
  const isSubscribed =
    !!recipe && !!subscriptions.data?.some((s) => s.authorId === recipe.authorId);
  const isOwner = !!recipe && user?.id === recipe.authorId;

  const favMutation = useMutation({
    mutationFn: () =>
      isFavorited ? api.unfavorite(recipe!.id) : api.favorite(recipe!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  const cookMutation = useMutation({
    mutationFn: (status: "cooked" | "want_to_cook" | null) =>
      status === null
        ? api.clearCookStatus(recipe!.id)
        : api.setCookStatus(recipe!.id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["want-to-cook"] });
      qc.invalidateQueries({ queryKey: ["history"] });
    },
  });

  const subMutation = useMutation({
    mutationFn: () =>
      isSubscribed
        ? api.unsubscribe(recipe!.authorId)
        : api.subscribe(recipe!.authorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteRecipe(recipe!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-recipes"] });
      navigate("/my-recipes");
    },
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorBox error={query.error} />;
  if (!recipe) return null;

  const totalTime = (recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0);

  return (
    <article className="detail">
      <div className="detail-head">
        <div>
          <div className="row gap center-v">
            <h1>{recipe.title}</h1>
            {recipe.status !== "published" && (
              <Badge tone="amber">{recipe.status}</Badge>
            )}
          </div>
          <div className="muted">
            by{" "}
            <Link to={`/authors/${recipe.authorId}`}>{recipe.authorName}</Link>
            {recipe.cuisineName ? ` · ${recipe.cuisineName}` : ""}
          </div>
          <div className="row gap center-v mt">
            <Stars
              average={recipe.rating.average}
              count={recipe.rating.count}
            />
            <DietaryBadges dietary={recipe.dietary} />
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="action-bar">
        <ShareButton slug={recipe.slug} shareUrl={recipe.shareUrl} />
        {isRegistered && !isOwner && (
          <>
            <button
              className={`btn ${isFavorited ? "btn-active" : ""}`}
              onClick={() => favMutation.mutate()}
              disabled={favMutation.isPending}
            >
              {isFavorited ? "★ Favorited" : "☆ Favorite"}
            </button>
            <button
              className={`btn ${wantsToCook ? "btn-active" : ""}`}
              onClick={() =>
                cookMutation.mutate(wantsToCook ? null : "want_to_cook")
              }
              disabled={cookMutation.isPending}
            >
              {wantsToCook ? "✓ Want to cook" : "Want to cook"}
            </button>
            <button
              className={`btn ${hasCooked ? "btn-active" : ""}`}
              onClick={() => cookMutation.mutate("cooked")}
              disabled={cookMutation.isPending}
            >
              {hasCooked ? "✓ Cooked" : "Mark cooked"}
            </button>
            <button
              className={`btn ${isSubscribed ? "btn-active" : ""}`}
              onClick={() => subMutation.mutate()}
              disabled={subMutation.isPending}
            >
              {isSubscribed ? "✓ Following author" : "Follow author"}
            </button>
          </>
        )}
        {isOwner && (
          <>
            <Link to={`/my-recipes/${recipe.id}/edit`} className="btn">
              Edit
            </Link>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (confirm("Delete this recipe permanently?"))
                  deleteMutation.mutate();
              }}
            >
              Delete
            </button>
          </>
        )}
        {isRegistered && !isOwner && (
          <ComplaintButton targetType="recipe" targetId={recipe.id} />
        )}
      </div>

      {recipe.photos.length > 0 && (
        <div className="photo-strip">
          {recipe.photos.map((p) => (
            <img key={p.id} src={p.url} alt={recipe.title} loading="lazy" />
          ))}
        </div>
      )}

      {recipe.description && <p className="lead">{recipe.description}</p>}

      <div className="detail-meta">
        {recipe.prepTimeMin != null && (
          <div>
            <strong>Prep</strong>
            <span>{recipe.prepTimeMin} min</span>
          </div>
        )}
        {recipe.cookTimeMin != null && (
          <div>
            <strong>Cook</strong>
            <span>{recipe.cookTimeMin} min</span>
          </div>
        )}
        {totalTime > 0 && (
          <div>
            <strong>Total</strong>
            <span>{totalTime} min</span>
          </div>
        )}
        {recipe.servings != null && (
          <div>
            <strong>Servings</strong>
            <span>{recipe.servings}</span>
          </div>
        )}
        {recipe.calories != null && (
          <div>
            <strong>Calories</strong>
            <span>{recipe.calories} kcal</span>
          </div>
        )}
        {recipe.difficulty && (
          <div>
            <strong>Difficulty</strong>
            <span>{recipe.difficulty}</span>
          </div>
        )}
      </div>

      <div className="detail-cols">
        <section className="ingredients">
          <h2>Ingredients</h2>
          <ul className="ingredient-list">
            {recipe.ingredients.map((ing) => (
              <li key={ing.ingredientId}>
                <span>
                  {ing.quantity ?? ""} {ing.unit ?? ""} {ing.name}
                </span>
                {ing.isBasic && <Badge tone="grey">basic</Badge>}
              </li>
            ))}
          </ul>
          {(recipe.categories.length > 0 || recipe.tags.length > 0) && (
            <div className="taxo">
              {recipe.categories.map((c) => (
                <Badge key={`c${c.id}`} tone="blue">
                  {c.name}
                </Badge>
              ))}
              {recipe.tags.map((t) => (
                <Badge key={`t${t.id}`}>#{t.name}</Badge>
              ))}
            </div>
          )}
        </section>

        <section className="steps">
          <h2>Steps</h2>
          <ol className="step-list">
            {recipe.steps.map((s) => (
              <li key={s.position}>
                <p>{s.text}</p>
                {s.photoUrl && (
                  <img src={s.photoUrl} alt={`Step ${s.position}`} />
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <ReviewsSection
        recipeId={recipe.id}
        comments={recipe.comments}
        canComment={isRegistered}
      />
    </article>
  );
}

function ShareButton({ slug, shareUrl }: { slug: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  // Public share link is /r/:slug. Prefer the server-provided shareUrl.
  const link = shareUrl || `${window.location.origin}/r/${slug}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* clipboard may be blocked; the link is shown below */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button className="btn" onClick={copy} title={link}>
      {copied ? "✓ Link copied" : "🔗 Share"}
    </button>
  );
}

function ComplaintButton({
  targetType,
  targetId,
}: {
  targetType: "recipe" | "user" | "comment";
  targetId: number;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => api.fileComplaint({ targetType, targetId, reason }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      alert("Complaint submitted. Thank you.");
    },
  });
  if (!open) {
    return (
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        ⚑ Report
      </button>
    );
  }
  return (
    <span className="complaint-inline">
      <input
        className="input"
        placeholder="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        className="btn btn-sm btn-primary"
        disabled={!reason || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Send
      </button>
      <button className="btn btn-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}

function ReviewsSection({
  recipeId,
  comments,
  canComment,
}: {
  recipeId: number;
  comments: Comment[];
  canComment: boolean;
}) {
  const qc = useQueryClient();
  const [rating, setRating] = useState<number>(0);
  const [body, setBody] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.addComment(recipeId, {
        rating: rating > 0 ? rating : undefined,
        body: body.trim() || undefined,
      }),
    onSuccess: () => {
      setRating(0);
      setBody("");
      qc.invalidateQueries({ queryKey: ["recipe"] });
    },
  });

  const visible = comments.filter((c) => c.status === "visible");

  return (
    <section className="reviews">
      <h2>Reviews & Ratings ({visible.length})</h2>

      {canComment ? (
        <form
          className="comment-form card"
          onSubmit={(e) => {
            e.preventDefault();
            if (rating === 0 && !body.trim()) return;
            mutation.mutate();
          }}
        >
          <div className="rating-picker">
            <span>Your rating:</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                className={`star-btn ${n <= rating ? "on" : ""}`}
                onClick={() => setRating(n === rating ? 0 : n)}
                aria-label={`${n} stars`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            className="input"
            placeholder="Share your thoughts (optional if you rate)…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
          />
          {mutation.isError && <ErrorBox error={mutation.error} />}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={(rating === 0 && !body.trim()) || mutation.isPending}
          >
            Post review
          </button>
        </form>
      ) : (
        <p className="muted">
          <Link to="/login">Log in</Link> to leave a review.
        </p>
      )}

      <ul className="comment-list">
        {visible.length === 0 && (
          <li className="muted">No reviews yet. Be the first!</li>
        )}
        {comments.map((c) => (
          <li
            key={c.id}
            className={`comment ${c.status === "hidden" ? "comment-hidden" : ""}`}
          >
            <div className="comment-head">
              <strong>{c.authorName}</strong>
              {c.rating != null && (
                <span className="star-filled">{"★".repeat(c.rating)}</span>
              )}
              {c.status === "hidden" && <Badge tone="red">hidden</Badge>}
              <span className="muted small">
                {new Date(c.createdAt).toLocaleDateString()}
              </span>
            </div>
            {c.body && <p>{c.body}</p>}
            {canComment && (
              <ComplaintButton targetType="comment" targetId={c.id} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
