// Typed fetch wrapper. Calls the API through the Vite "/api" proxy with relative
// paths so it works in dev and same-origin prod.

import type {
  AdminRecipeBody,
  AdminStats,
  AdminUserView,
  AppNotification,
  AuthResponse,
  Category,
  Comment,
  Complaint,
  Cuisine,
  HistoryItem,
  Ingredient,
  Paged,
  Preferences,
  PublicUser,
  RecipeBody,
  RecipeDetail,
  RecipePhoto,
  RecipeStatus,
  RecipeSummary,
  RecommendationItem,
  SmartSelectionItem,
  SubscriptionItem,
  Tag,
  WantToCookItem,
} from "./types";

const TOKEN_KEY = "recipes.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // When body is FormData, do not set JSON content-type.
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `/api${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData, query } = options;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(buildUrl(path, query), { method, headers, body: payload });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(
      res.status,
      err.code ?? "internal_error",
      err.message ?? res.statusText,
      err.details,
    );
  }
  return data as T;
}

// ---- Auth & profile ----
export const api = {
  register: (body: { email: string; password: string; displayName: string }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<{ user: PublicUser }>("/me"),
  updateMe: (body: { displayName?: string; bio?: string; avatarUrl?: string }) =>
    request<{ user: PublicUser }>("/me", { method: "PUT", body }),
  getPreferences: () => request<{ preferences: Preferences }>("/me/preferences"),
  updatePreferences: (body: Partial<Preferences>) =>
    request<{ preferences: Preferences }>("/me/preferences", { method: "PUT", body }),

  // ---- Catalog ----
  categories: () => request<{ items: Category[] }>("/categories"),
  tags: () => request<{ items: Tag[] }>("/tags"),
  cuisines: () => request<{ items: Cuisine[] }>("/cuisines"),
  ingredients: (basic?: boolean) =>
    request<{ items: Ingredient[] }>("/ingredients", { query: { basic } }),

  // ---- Recipes (read) ----
  recipes: (q: {
    page?: number;
    pageSize?: number;
    authorId?: number;
    sort?: "newest" | "oldest";
  }) => request<Paged<RecipeSummary>>("/recipes", { query: q }),
  recipe: (idOrSlug: string | number) =>
    request<{ recipe: RecipeDetail }>(`/recipes/${idOrSlug}`),

  search: (q: Record<string, string | number | boolean | undefined>) =>
    request<Paged<RecipeSummary>>("/search", { query: q }),

  // ---- Authoring ----
  myRecipes: () => request<{ items: RecipeSummary[] }>("/me/recipes"),
  createRecipe: (body: RecipeBody) =>
    request<{ recipe: RecipeDetail }>("/recipes", { method: "POST", body }),
  updateRecipe: (id: number, body: RecipeBody) =>
    request<{ recipe: RecipeDetail }>(`/recipes/${id}`, { method: "PUT", body }),
  deleteRecipe: (id: number) =>
    request<void>(`/recipes/${id}`, { method: "DELETE" }),
  uploadPhoto: (id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ photo: RecipePhoto & { recipeId: number; key: string } }>(
      `/recipes/${id}/photos`,
      { method: "POST", formData: fd },
    );
  },

  // ---- Discovery ----
  smartSelection: (ingredientIds: number[], limit?: number) =>
    request<{ items: SmartSelectionItem[] }>("/smart-selection", {
      method: "POST",
      body: { ingredientIds, limit },
    }),
  recommendations: (limit?: number) =>
    request<{ items: RecommendationItem[] }>("/recommendations", { query: { limit } }),

  // ---- Social ----
  comments: (recipeId: number) =>
    request<{ items: Comment[] }>(`/recipes/${recipeId}/comments`),
  addComment: (recipeId: number, body: { rating?: number; body?: string }) =>
    request<{ comment: Comment }>(`/recipes/${recipeId}/comments`, {
      method: "POST",
      body,
    }),
  favorite: (recipeId: number) =>
    request<{ ok: boolean; favorited: boolean }>(`/recipes/${recipeId}/favorite`, {
      method: "PUT",
    }),
  unfavorite: (recipeId: number) =>
    request<{ ok: boolean; favorited: boolean }>(`/recipes/${recipeId}/favorite`, {
      method: "DELETE",
    }),
  favorites: () => request<{ items: RecipeSummary[] }>("/me/favorites"),
  setCookStatus: (recipeId: number, status: "cooked" | "want_to_cook") =>
    request<{ ok: boolean; status: string | null }>(`/recipes/${recipeId}/cook-status`, {
      method: "PUT",
      body: { status },
    }),
  clearCookStatus: (recipeId: number) =>
    request<{ ok: boolean; status: string | null }>(`/recipes/${recipeId}/cook-status`, {
      method: "DELETE",
    }),
  history: () => request<{ items: HistoryItem[] }>("/me/history"),
  wantToCook: () => request<{ items: WantToCookItem[] }>("/me/want-to-cook"),
  subscribe: (authorId: number) =>
    request<{ ok: boolean; subscribed: boolean }>(`/subscriptions/${authorId}`, {
      method: "POST",
    }),
  unsubscribe: (authorId: number) =>
    request<{ ok: boolean; subscribed: boolean }>(`/subscriptions/${authorId}`, {
      method: "DELETE",
    }),
  subscriptions: () => request<{ items: SubscriptionItem[] }>("/me/subscriptions"),

  // ---- Notifications ----
  notifications: (unread?: boolean) =>
    request<{ items: AppNotification[]; unreadCount: number }>("/me/notifications", {
      query: { unread },
    }),
  markNotificationRead: (id: number) =>
    request<{ ok: true }>(`/me/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () =>
    request<{ ok: true; updated: number }>("/me/notifications/read-all", {
      method: "POST",
    }),

  // ---- Complaints ----
  fileComplaint: (body: {
    targetType: "recipe" | "user" | "comment";
    targetId: number;
    reason: string;
  }) => request<{ complaint: { id: number } }>("/complaints", { method: "POST", body }),

  // ---- Admin ----
  admin: {
    stats: () => request<AdminStats>("/admin/stats"),
    submissions: () => request<{ items: RecipeSummary[] }>("/admin/submissions"),
    approveRecipe: (id: number) =>
      request<{ recipe: RecipeSummary }>(`/admin/recipes/${id}/approve`, {
        method: "POST",
      }),
    hideRecipe: (id: number) =>
      request<{ recipe: RecipeSummary }>(`/admin/recipes/${id}/hide`, { method: "POST" }),
    unhideRecipe: (id: number) =>
      request<{ recipe: RecipeSummary }>(`/admin/recipes/${id}/unhide`, {
        method: "POST",
      }),
    recipes: (status?: RecipeStatus) =>
      request<{ items: RecipeSummary[] }>("/admin/recipes", { query: { status } }),
    recipe: (id: number) =>
      request<{ recipe: RecipeDetail }>(`/admin/recipes/${id}`),
    createRecipe: (body: AdminRecipeBody) =>
      request<{ recipe: RecipeDetail }>("/admin/recipes", { method: "POST", body }),
    updateRecipe: (id: number, body: AdminRecipeBody) =>
      request<{ recipe: RecipeDetail }>(`/admin/recipes/${id}`, { method: "PUT", body }),
    deleteRecipe: (id: number) =>
      request<void>(`/admin/recipes/${id}`, { method: "DELETE" }),

    hideComment: (id: number) =>
      request<{ ok: true }>(`/admin/comments/${id}/hide`, { method: "POST" }),
    unhideComment: (id: number) =>
      request<{ ok: true }>(`/admin/comments/${id}/unhide`, { method: "POST" }),
    deleteComment: (id: number) =>
      request<void>(`/admin/comments/${id}`, { method: "DELETE" }),

    complaints: (status?: "open" | "resolved") =>
      request<{ items: Complaint[] }>("/admin/complaints", { query: { status } }),
    resolveComplaint: (id: number) =>
      request<{ ok: true }>(`/admin/complaints/${id}/resolve`, { method: "POST" }),

    users: () => request<{ items: AdminUserView[] }>("/admin/users"),
    user: (id: number) => request<{ user: AdminUserView }>(`/admin/users/${id}`),
    blockUser: (id: number) =>
      request<{ ok: boolean; status: "blocked" }>(`/admin/users/${id}/block`, {
        method: "POST",
      }),
    unblockUser: (id: number) =>
      request<{ ok: boolean; status: "active" }>(`/admin/users/${id}/unblock`, {
        method: "POST",
      }),
    setUserRole: (id: number, role: "registered" | "admin") =>
      request<{ ok: boolean; role: string }>(`/admin/users/${id}/role`, {
        method: "PUT",
        body: { role },
      }),
    deleteUser: (id: number) =>
      request<void>(`/admin/users/${id}`, { method: "DELETE" }),

    createCategory: (body: { name: string; description?: string }) =>
      request<{ category: Category }>("/admin/categories", { method: "POST", body }),
    updateCategory: (id: number, body: { name: string; description?: string }) =>
      request<{ category: Category }>(`/admin/categories/${id}`, { method: "PUT", body }),
    deleteCategory: (id: number) =>
      request<void>(`/admin/categories/${id}`, { method: "DELETE" }),

    createTag: (body: { name: string }) =>
      request<{ tag: Tag }>("/admin/tags", { method: "POST", body }),
    updateTag: (id: number, body: { name: string }) =>
      request<{ tag: Tag }>(`/admin/tags/${id}`, { method: "PUT", body }),
    deleteTag: (id: number) => request<void>(`/admin/tags/${id}`, { method: "DELETE" }),

    createCuisine: (body: { name: string }) =>
      request<{ cuisine: Cuisine }>("/admin/cuisines", { method: "POST", body }),
    updateCuisine: (id: number, body: { name: string }) =>
      request<{ cuisine: Cuisine }>(`/admin/cuisines/${id}`, { method: "PUT", body }),
    deleteCuisine: (id: number) =>
      request<void>(`/admin/cuisines/${id}`, { method: "DELETE" }),

    createIngredient: (body: { name: string; isBasic?: boolean }) =>
      request<{ ingredient: Ingredient }>("/admin/ingredients", { method: "POST", body }),
    updateIngredient: (id: number, body: { name: string; isBasic?: boolean }) =>
      request<{ ingredient: Ingredient }>(`/admin/ingredients/${id}`, {
        method: "PUT",
        body,
      }),
    deleteIngredient: (id: number) =>
      request<void>(`/admin/ingredients/${id}`, { method: "DELETE" }),
  },
};
