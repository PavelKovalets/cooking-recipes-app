import { Link } from "react-router-dom";
import type { RecipeSummary } from "../lib/types";
import { Badge, DietaryBadges, Stars } from "./ui";

const STATUS_TONE: Record<string, string> = {
  published: "green",
  pending: "amber",
  hidden: "red",
  draft: "grey",
};

export function RecipeCard({
  recipe,
  extra,
  showStatus,
}: {
  recipe: RecipeSummary;
  extra?: React.ReactNode;
  showStatus?: boolean;
}) {
  const totalTime =
    (recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0) || null;
  return (
    <div className="card recipe-card">
      <Link to={`/recipes/${recipe.slug}`} className="card-thumb-link">
        {recipe.thumbnailUrl ? (
          <img
            className="card-thumb"
            src={recipe.thumbnailUrl}
            alt={recipe.title}
            loading="lazy"
          />
        ) : (
          <div className="card-thumb card-thumb-placeholder">No photo</div>
        )}
      </Link>
      <div className="card-body">
        <div className="card-title-row">
          <Link to={`/recipes/${recipe.slug}`} className="card-title">
            {recipe.title}
          </Link>
          {showStatus && (
            <Badge tone={STATUS_TONE[recipe.status] ?? "grey"}>
              {recipe.status}
            </Badge>
          )}
        </div>
        <div className="small muted">
          by {recipe.authorName}
          {recipe.cuisineName ? ` · ${recipe.cuisineName}` : ""}
        </div>
        {recipe.description && (
          <p className="card-desc">{recipe.description}</p>
        )}
        <div className="card-meta small muted">
          {totalTime != null && <span>⏱ {totalTime} min</span>}
          {recipe.calories != null && <span>{recipe.calories} kcal</span>}
          {recipe.difficulty && <span>{recipe.difficulty}</span>}
        </div>
        <DietaryBadges dietary={recipe.dietary} />
        <div className="card-footer">
          <Stars average={recipe.rating.average} count={recipe.rating.count} />
        </div>
        {extra}
      </div>
    </div>
  );
}

export function RecipeGrid({ recipes }: { recipes: RecipeSummary[] }) {
  return (
    <div className="recipe-grid">
      {recipes.map((r) => (
        <RecipeCard key={r.id} recipe={r} />
      ))}
    </div>
  );
}
