/**
 * Drizzle schema for the recipe-sharing app (Phase 1).
 *
 * Source of truth: spec/architecture.md §5 (data model) and §6 (feature logic),
 * derived from spec/objective.md. See spec/data-model.md for the full narrative,
 * the ER diagram, and how smart-selection + full-text search are implemented.
 *
 * Conventions:
 *  - Every table has `id` (bigint identity), `created_at`, `updated_at`.
 *  - Soft-hide (status columns) instead of hard deletes for recipes & comments
 *    so moderation can hide/restore and statistics stay consistent (§5, §8).
 *  - The generated `search_vector` tsvector column and its GIN index, the
 *    denormalized ingredient-id array + GIN index, and the trigger that keeps
 *    that array in sync are NOT expressible in Drizzle 0.36; they are appended
 *    as raw SQL to the generated migration. They are still declared here (the
 *    tsvector column via a custom type; the array column natively) so the rest
 *    of the codebase can read/query them type-safely.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Custom column types                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Postgres `tsvector`. Drizzle has no first-class tsvector type; this maps it
 * to a string on the TS side. The column itself is created as a GENERATED
 * ALWAYS column in raw SQL appended to the migration (Drizzle 0.36 cannot
 * express a generated tsvector built from multiple columns).
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

/* -------------------------------------------------------------------------- */
/* Shared column helpers                                                       */
/* -------------------------------------------------------------------------- */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const userRole = pgEnum("user_role", ["registered", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "blocked"]);
export const recipeStatus = pgEnum("recipe_status", [
  "draft",
  "pending",
  "published",
  "hidden",
]);
export const recipeDifficulty = pgEnum("recipe_difficulty", [
  "easy",
  "medium",
  "hard",
]);
export const cookStatusKind = pgEnum("cook_status_kind", [
  "cooked",
  "want_to_cook",
]);
export const commentStatus = pgEnum("comment_status", ["visible", "hidden"]);
export const complaintTarget = pgEnum("complaint_target", [
  "recipe",
  "user",
  "comment",
]);
export const complaintStatus = pgEnum("complaint_status", ["open", "resolved"]);
export const notificationType = pgEnum("notification_type", [
  "new_comment",
  "new_rating",
  "new_recipe_from_author",
]);

/* -------------------------------------------------------------------------- */
/* Users & preferences                                                        */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    role: userRole("role").notNull().default("registered"),
    status: userStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_key").on(t.email),
    statusIdx: index("users_status_idx").on(t.status),
  }),
);

/**
 * One row per user. `diets` carries the four dietary flags as a set; `allergies`
 * and `dislikedIngredients` hold ingredient ids. Drives filtering, smart
 * selection, and recommendations alike (§5).
 */
export const userPreferences = pgTable("user_preferences", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  vegan: boolean("vegan").notNull().default(false),
  vegetarian: boolean("vegetarian").notNull().default(false),
  glutenFree: boolean("gluten_free").notNull().default(false),
  lactoseFree: boolean("lactose_free").notNull().default(false),
  // ingredient ids the user is allergic to / dislikes (FK enforced in app layer
  // since Postgres arrays cannot carry per-element FKs).
  allergies: bigint("allergies", { mode: "number" }).array().notNull().default(sql`'{}'::bigint[]`),
  dislikedIngredients: bigint("disliked_ingredients", { mode: "number" })
    .array()
    .notNull()
    .default(sql`'{}'::bigint[]`),
  ...timestamps,
}, (t) => ({
  userUnique: uniqueIndex("user_preferences_user_key").on(t.userId),
}));

/* -------------------------------------------------------------------------- */
/* Taxonomy: categories, tags, cuisines, ingredients                          */
/* -------------------------------------------------------------------------- */

export const categories = pgTable(
  "categories",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => ({
    nameUnique: uniqueIndex("categories_name_key").on(t.name),
    slugUnique: uniqueIndex("categories_slug_key").on(t.slug),
  }),
);

export const tags = pgTable(
  "tags",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    ...timestamps,
  },
  (t) => ({
    nameUnique: uniqueIndex("tags_name_key").on(t.name),
    slugUnique: uniqueIndex("tags_slug_key").on(t.slug),
  }),
);

export const cuisines = pgTable(
  "cuisines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    ...timestamps,
  },
  (t) => ({
    nameUnique: uniqueIndex("cuisines_name_key").on(t.name),
    slugUnique: uniqueIndex("cuisines_slug_key").on(t.slug),
  }),
);

/**
 * Admin-managed master list. `is_basic` flags pantry staples assumed on-hand
 * for smart selection (objective's "basic ingredients") (§5, §6.2).
 */
export const ingredients = pgTable(
  "ingredients",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    isBasic: boolean("is_basic").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    nameUnique: uniqueIndex("ingredients_name_key").on(t.name),
    slugUnique: uniqueIndex("ingredients_slug_key").on(t.slug),
    isBasicIdx: index("ingredients_is_basic_idx").on(t.isBasic),
  }),
);

/* -------------------------------------------------------------------------- */
/* Recipes                                                                     */
/* -------------------------------------------------------------------------- */

export const recipes = pgTable(
  "recipes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    authorId: bigint("author_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 240 }).notNull(),
    slug: varchar("slug", { length: 280 }).notNull(),
    description: text("description").notNull().default(""),
    cuisineId: bigint("cuisine_id", { mode: "number" }).references(
      () => cuisines.id,
      { onDelete: "set null" },
    ),
    status: recipeStatus("status").notNull().default("draft"),
    // Filter columns (§5, §6.1)
    prepTimeMin: integer("prep_time_min"),
    cookTimeMin: integer("cook_time_min"),
    calories: integer("calories"),
    difficulty: recipeDifficulty("difficulty"),
    servings: integer("servings"),
    // Dietary flags (§5, §6.1)
    vegan: boolean("vegan").notNull().default(false),
    vegetarian: boolean("vegetarian").notNull().default(false),
    glutenFree: boolean("gluten_free").notNull().default(false),
    lactoseFree: boolean("lactose_free").notNull().default(false),
    // Denormalized set of required (non-basic) ingredient ids for fast overlap
    // queries (§6.2). Kept in sync by a trigger created in raw SQL.
    ingredientIds: bigint("ingredient_ids", { mode: "number" })
      .array()
      .notNull()
      .default(sql`'{}'::bigint[]`),
    // Full-text search vector over title + description (§6.1). Generated column
    // so it is always consistent and never written by the app. The GIN index on
    // it is added in raw SQL appended to the migration (drizzle-kit emits the
    // generated column but not a GIN index on a custom type).
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')`,
    ),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    slugUnique: uniqueIndex("recipes_slug_key").on(t.slug),
    authorIdx: index("recipes_author_idx").on(t.authorId),
    cuisineIdx: index("recipes_cuisine_idx").on(t.cuisineId),
    statusIdx: index("recipes_status_idx").on(t.status),
    prepTimeIdx: index("recipes_prep_time_idx").on(t.prepTimeMin),
    cookTimeIdx: index("recipes_cook_time_idx").on(t.cookTimeMin),
    caloriesIdx: index("recipes_calories_idx").on(t.calories),
    difficultyIdx: index("recipes_difficulty_idx").on(t.difficulty),
    // Composite that fits the common catalog query: published recipes newest-first.
    statusPublishedIdx: index("recipes_status_published_at_idx").on(
      t.status,
      t.publishedAt,
    ),
  }),
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: bigint("ingredient_id", { mode: "number" })
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    quantity: varchar("quantity", { length: 60 }),
    unit: varchar("unit", { length: 40 }),
    position: smallint("position").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    recipeIngredientUnique: uniqueIndex("recipe_ingredients_recipe_ingredient_key").on(
      t.recipeId,
      t.ingredientId,
    ),
    recipeIdx: index("recipe_ingredients_recipe_idx").on(t.recipeId),
    ingredientIdx: index("recipe_ingredients_ingredient_idx").on(t.ingredientId),
  }),
);

export const steps = pgTable(
  "steps",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    text: text("text").notNull(),
    photoUrl: text("photo_url"),
    ...timestamps,
  },
  (t) => ({
    recipePositionUnique: uniqueIndex("steps_recipe_position_key").on(
      t.recipeId,
      t.position,
    ),
    recipeIdx: index("steps_recipe_idx").on(t.recipeId),
  }),
);

export const photos = pgTable(
  "photos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    position: smallint("position").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    recipeIdx: index("photos_recipe_idx").on(t.recipeId),
  }),
);

/* -------------------------------------------------------------------------- */
/* Recipe <-> taxonomy join tables                                            */
/* -------------------------------------------------------------------------- */

export const recipeCategories = pgTable(
  "recipe_categories",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    categoryId: bigint("category_id", { mode: "number" })
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => ({
    pairUnique: uniqueIndex("recipe_categories_pair_key").on(
      t.recipeId,
      t.categoryId,
    ),
    categoryIdx: index("recipe_categories_category_idx").on(t.categoryId),
  }),
);

export const recipeTags = pgTable(
  "recipe_tags",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: bigint("tag_id", { mode: "number" })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => ({
    pairUnique: uniqueIndex("recipe_tags_pair_key").on(t.recipeId, t.tagId),
    tagIdx: index("recipe_tags_tag_idx").on(t.tagId),
  }),
);

/* -------------------------------------------------------------------------- */
/* Social: favorites, cook status, comments, subscriptions                    */
/* -------------------------------------------------------------------------- */

export const favorites = pgTable(
  "favorites",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => ({
    pairUnique: uniqueIndex("favorites_user_recipe_key").on(
      t.userId,
      t.recipeId,
    ),
    recipeIdx: index("favorites_recipe_idx").on(t.recipeId),
  }),
);

/**
 * One row per (user, recipe). `status` is cooked | want_to_cook. Cooking
 * history = rows where status = cooked ordered by `marked_at` (§5).
 */
export const cookStatus = pgTable(
  "cook_status",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    status: cookStatusKind("status").notNull(),
    markedAt: timestamp("marked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (t) => ({
    pairUnique: uniqueIndex("cook_status_user_recipe_key").on(
      t.userId,
      t.recipeId,
    ),
    userStatusIdx: index("cook_status_user_status_idx").on(t.userId, t.status),
    recipeIdx: index("cook_status_recipe_idx").on(t.recipeId),
  }),
);

/**
 * Doubles as reviews + ratings. `rating` is 1-5 (nullable for pure comments);
 * the CHECK constraint is added in raw SQL. Recipe rating = aggregate over
 * visible rows (§5).
 */
export const comments = pgTable(
  "comments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: smallint("rating"),
    body: text("body").notNull().default(""),
    status: commentStatus("status").notNull().default("visible"),
    ...timestamps,
  },
  (t) => ({
    recipeStatusIdx: index("comments_recipe_status_idx").on(
      t.recipeId,
      t.status,
    ),
    userIdx: index("comments_user_idx").on(t.userId),
  }),
);

/** subscriber follows author; notified on the author's new recipes (§5, §6.4). */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    subscriberId: bigint("subscriber_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorId: bigint("author_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => ({
    pairUnique: uniqueIndex("subscriptions_subscriber_author_key").on(
      t.subscriberId,
      t.authorId,
    ),
    authorIdx: index("subscriptions_author_idx").on(t.authorId),
  }),
);

/* -------------------------------------------------------------------------- */
/* Notifications & complaints                                                  */
/* -------------------------------------------------------------------------- */

export const notifications = pgTable(
  "notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    // Feed query: a user's notifications newest-first; unread filter is cheap.
    userCreatedIdx: index("notifications_user_created_idx").on(
      t.userId,
      t.createdAt,
    ),
    userUnreadIdx: index("notifications_user_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
  }),
);

export const complaints = pgTable(
  "complaints",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reporterId: bigint("reporter_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: complaintTarget("target_type").notNull(),
    targetId: bigint("target_id", { mode: "number" }).notNull(),
    reason: text("reason").notNull().default(""),
    status: complaintStatus("status").notNull().default("open"),
    ...timestamps,
  },
  (t) => ({
    statusIdx: index("complaints_status_idx").on(t.status),
    targetIdx: index("complaints_target_idx").on(t.targetType, t.targetId),
  }),
);

/* -------------------------------------------------------------------------- */
/* Inferred types (ergonomic exports for the backend)                         */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type Cuisine = typeof cuisines.$inferSelect;
export type NewCuisine = typeof cuisines.$inferInsert;
export type Ingredient = typeof ingredients.$inferSelect;
export type NewIngredient = typeof ingredients.$inferInsert;
export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert;
export type Step = typeof steps.$inferSelect;
export type NewStep = typeof steps.$inferInsert;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
export type RecipeCategory = typeof recipeCategories.$inferSelect;
export type NewRecipeCategory = typeof recipeCategories.$inferInsert;
export type RecipeTag = typeof recipeTags.$inferSelect;
export type NewRecipeTag = typeof recipeTags.$inferInsert;
export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
export type CookStatus = typeof cookStatus.$inferSelect;
export type NewCookStatus = typeof cookStatus.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Complaint = typeof complaints.$inferSelect;
export type NewComplaint = typeof complaints.$inferInsert;
