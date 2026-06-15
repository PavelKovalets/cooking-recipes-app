import type { ReactNode } from "react";
import { ApiError } from "../lib/api";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="muted center pad">{label}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong.";
  return <div className="error-box">{message}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="muted center pad">{children}</div>;
}

export function Stars({
  average,
  count,
}: {
  average: number | null;
  count: number;
}) {
  if (average == null || count === 0) {
    return <span className="muted small">No ratings</span>;
  }
  const rounded = Math.round(average);
  return (
    <span className="stars" title={`${average.toFixed(1)} from ${count}`}>
      <span className="star-filled">{"★".repeat(rounded)}</span>
      <span className="star-empty">{"★".repeat(5 - rounded)}</span>
      <span className="small muted"> {average.toFixed(1)} ({count})</span>
    </span>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ""}`}>{children}</span>;
}

export function DietaryBadges({
  dietary,
}: {
  dietary: {
    vegan: boolean;
    vegetarian: boolean;
    glutenFree: boolean;
    lactoseFree: boolean;
  };
}) {
  const items: string[] = [];
  if (dietary.vegan) items.push("Vegan");
  if (dietary.vegetarian) items.push("Vegetarian");
  if (dietary.glutenFree) items.push("Gluten-free");
  if (dietary.lactoseFree) items.push("Lactose-free");
  if (items.length === 0) return null;
  return (
    <div className="diet-badges">
      {items.map((i) => (
        <Badge key={i} tone="green">
          {i}
        </Badge>
      ))}
    </div>
  );
}
