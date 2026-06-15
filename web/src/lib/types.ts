// Types mirror the backend contract in spec/api.md exactly.

export type Role = "guest" | "registered" | "admin";
export type UserStatus = "active" | "blocked";
export type Difficulty = "easy" | "medium" | "hard";
export type RecipeStatus = "draft" | "pending" | "published" | "hidden";
export type CommentStatus = "visible" | "hidden";

export interface Dietary {
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  lactoseFree: boolean;
}

export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export interface AdminUserView extends PublicUser {
  recipeCount: number;
}

export interface RecipeSummary {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  status: RecipeStatus;
  authorId: number;
  authorName: string;
  cuisineId: number | null;
  cuisineName: string | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  calories: number | null;
  difficulty: Difficulty | null;
  servings: number | null;
  dietary: Dietary;
  thumbnailUrl: string | null;
  rating: { average: number | null; count: number };
  publishedAt: string | null;
  createdAt: string;
}

export interface RecipeIngredient {
  ingredientId: number;
  name: string;
  isBasic: boolean;
  quantity: string | null;
  unit: string | null;
  position: number;
}

export interface RecipeStep {
  position: number;
  text: string;
  photoUrl: string | null;
}

export interface RecipePhoto {
  id: number;
  url: string;
  position: number;
}

export interface TaxonomyRef {
  id: number;
  name: string;
  slug: string;
}

export interface Comment {
  id: number;
  recipeId: number;
  userId: number;
  authorName: string;
  rating: number | null;
  body: string | null;
  status: CommentStatus;
  createdAt: string;
}

export interface RecipeDetail extends RecipeSummary {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  photos: RecipePhoto[];
  categories: TaxonomyRef[];
  tags: TaxonomyRef[];
  comments: Comment[];
  shareUrl: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}
export interface Tag {
  id: number;
  name: string;
  slug: string;
}
export interface Cuisine {
  id: number;
  name: string;
  slug: string;
}
export interface Ingredient {
  id: number;
  name: string;
  slug: string;
  isBasic: boolean;
}

export interface Preferences {
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  lactoseFree: boolean;
  allergies: number[];
  dislikedIngredients: number[];
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export interface SmartSelectionItem {
  recipe: RecipeSummary;
  missingCount: number;
  missingIngredientIds: number[];
  canCookNow: boolean;
}

export interface RecommendationItem {
  recipe: RecipeSummary;
  score: number;
}

export interface HistoryItem {
  recipe: RecipeSummary;
  cookedAt: string;
}

export interface WantToCookItem {
  recipe: RecipeSummary;
  markedAt: string;
}

export interface SubscriptionItem {
  authorId: number;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  since: string;
}

export type NotificationType =
  | "new_comment"
  | "new_rating"
  | "new_recipe_from_author";

export interface AppNotification {
  id: number;
  type: NotificationType;
  payload: Record<string, unknown>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export type CookStatus = "cooked" | "want_to_cook";

export interface AdminStats {
  recipes: {
    total: number;
    published: number;
    pending: number;
    hidden: number;
    draft: number;
  };
  users: {
    total: number;
    active: number;
    blocked: number;
    admins: number;
    authors: number;
  };
  engagement: {
    comments: number;
    ratings: number;
    favorites: number;
    cookedMarks: number;
    subscriptions: number;
  };
  moderation: {
    openComplaints: number;
    pendingRecipes: number;
    hiddenComments: number;
  };
  popularCategories: { categoryId: number; name: string; recipeCount: number }[];
  topRatedRecipes: {
    recipeId: number;
    title: string;
    averageRating: number;
    ratingCount: number;
  }[];
  mostActiveUsers: {
    userId: number;
    displayName: string;
    recipeCount: number;
    commentCount: number;
  }[];
}

export interface Complaint {
  id: number;
  reporterId: number;
  reporterName: string;
  targetType: "recipe" | "user" | "comment";
  targetId: number;
  reason: string;
  status: "open" | "resolved";
  createdAt: string;
}

export interface RecipeIngredientInput {
  ingredientId: number;
  quantity?: string;
  unit?: string;
}

export interface RecipeStepInput {
  text: string;
  photoUrl?: string;
}

export interface RecipeBody {
  title?: string;
  description?: string | null;
  cuisineId?: number | null;
  prepTimeMin?: number | null;
  cookTimeMin?: number | null;
  calories?: number | null;
  difficulty?: Difficulty | null;
  servings?: number | null;
  vegan?: boolean;
  vegetarian?: boolean;
  glutenFree?: boolean;
  lactoseFree?: boolean;
  categoryIds?: number[];
  tagIds?: number[];
  ingredients?: RecipeIngredientInput[];
  steps?: RecipeStepInput[];
}

export interface AdminRecipeBody extends RecipeBody {
  status?: RecipeStatus;
}
