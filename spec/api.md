# API contract (Phase 1)

The backend contract the web SPA builds against. Implemented in `api/src`
(`buildApp()` in `api/src/app.ts`). Derived from
[`objective.md`](./objective.md) and [`architecture.md`](./architecture.md) §7/§8.

## Conventions

- **Base path:** every API route is mounted under **`/api`** (e.g.
  `POST /api/auth/login`). The dev SPA proxies `/api → :3000`; prod serves the
  SPA same-origin. Two routes live at the **root** (not `/api`): the public share
  page `GET /r/:slug` and media `GET /media/*`.
- **Content type:** JSON request/response, except photo upload (multipart) and
  the share page (`text/html`).
- **Auth:** `Authorization: Bearer <jwt>`. Tokens are returned by
  register/login and expire in 7 days. Payload: `{ sub: userId, role }`.
- **Roles:** `guest` (no/invalid token) ⊂ `registered` ⊂ `admin`. The user's
  live `status`/`role` is re-checked from the DB on every authenticated request,
  so **blocking takes effect immediately** (a blocked user gets `403` even with a
  valid token). All `/api/admin/*` routes require `admin`.
- **Ownership:** authoring edits/deletes/photo-uploads require the caller to be
  the recipe author or an admin (`403` otherwise).
- **Error shape (all errors):**
  ```json
  { "error": { "code": "bad_request", "message": "…", "details": { } } }
  ```
  Codes: `bad_request` (400, includes `details.issues[]` for validation),
  `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409),
  `payload_too_large` (413), `unsupported_media_type` (415), `internal_error`
  (500).
- **Pagination:** list endpoints that paginate accept `?page` (1-based, default
  1) and `?pageSize` (default 20, max 100) and return:
  ```json
  { "items": [ ... ], "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 }
  ```
- **IDs** are JSON numbers. Timestamps are ISO-8601 strings.

## Shared response shapes

### RecipeSummary (list cards)
```json
{
  "id": 1, "title": "…", "slug": "…", "description": "…",
  "status": "published",
  "authorId": 2, "authorName": "Alice Baker",
  "cuisineId": 1, "cuisineName": "Italian",
  "prepTimeMin": 10, "cookTimeMin": 15, "calories": 650,
  "difficulty": "medium", "servings": 2,
  "dietary": { "vegan": false, "vegetarian": false, "glutenFree": false, "lactoseFree": false },
  "thumbnailUrl": "http://…/media/… | https://… | null",
  "rating": { "average": 4.5, "count": 2 },
  "publishedAt": "2026-…Z | null", "createdAt": "2026-…Z"
}
```

### RecipeDetail (extends RecipeSummary)
Adds:
```json
{
  "ingredients": [ { "ingredientId": 10, "name": "Spaghetti", "isBasic": false, "quantity": "200", "unit": "g", "position": 0 } ],
  "steps": [ { "position": 1, "text": "…", "photoUrl": "… | null" } ],
  "photos": [ { "id": 5, "url": "…", "position": 0 } ],
  "categories": [ { "id": 2, "name": "Main Course", "slug": "main-course" } ],
  "tags": [ { "id": 1, "name": "quick", "slug": "quick" } ],
  "comments": [ { "id": 1, "userId": 3, "authorName": "Bob", "rating": 5, "body": "…", "status": "visible", "createdAt": "…Z" } ],
  "shareUrl": "http://localhost:3000/r/spaghetti-carbonara"
}
```
Hidden comments are included only when the caller is the recipe's author or an
admin.

### PublicUser
```json
{ "id": 2, "email": "a@b.c", "displayName": "Alice", "bio": "… | null",
  "avatarUrl": "… | null", "role": "registered", "status": "active", "createdAt": "…Z" }
```

---

## Auth  (module: auth)

| Method | Path | Role | Body / Query | Response |
|---|---|---|---|---|
| POST | `/api/auth/register` | guest | `{ email, password(≥8), displayName }` | `201 { token, user: PublicUser }` |
| POST | `/api/auth/login` | guest | `{ email, password }` | `200 { token, user: PublicUser }` |
| POST | `/api/auth/logout` | guest | – | `200 { ok: true }` (stateless; client drops token) |
| GET | `/api/me` | registered | – | `{ user: PublicUser }` |

## Profile & preferences  (module: users)

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| PUT | `/api/me` | registered | `{ displayName?, bio?, avatarUrl? }` | `{ user: PublicUser }` |
| GET | `/api/me/preferences` | registered | – | `{ preferences }` |
| PUT | `/api/me/preferences` | registered | `{ vegan?, vegetarian?, glutenFree?, lactoseFree?, allergies?: number[], dislikedIngredients?: number[] }` | `{ preferences }` |

`preferences` = `{ vegan, vegetarian, glutenFree, lactoseFree, allergies: number[], dislikedIngredients: number[] }`.
`allergies`/`dislikedIngredients` are ingredient ids.

## Catalog read  (module: catalog) — guest

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/categories` | – | `{ items: [ { id, name, slug, description } ] }` |
| GET | `/api/tags` | – | `{ items: [ { id, name, slug } ] }` |
| GET | `/api/cuisines` | – | `{ items: [ { id, name, slug } ] }` |
| GET | `/api/ingredients` | `?basic=true` filters to is_basic | `{ items: [ { id, name, slug, isBasic } ] }` |

## Recipes  (module: recipes)

| Method | Path | Role | Body / Query | Response |
|---|---|---|---|---|
| GET | `/api/recipes` | guest | `?page,?pageSize,?authorId,?sort=newest\|oldest` | Page of RecipeSummary (published only) |
| GET | `/api/recipes/:idOrSlug` | guest | accepts numeric id or slug | `{ recipe: RecipeDetail }` |
| GET | `/api/recipes/:idOrSlug/share` | guest | – | `{ share: { url, title, description, image, openGraph } }` |
| GET | `/api/me/recipes` | registered | – | `{ items: RecipeSummary[] }` (own recipes, any status) |
| POST | `/api/recipes` | registered | RecipeBody (below) | `201 { recipe: RecipeDetail }` — **status=`pending`** for registered users; admins create `published` |
| PUT | `/api/recipes/:id` | owner/admin | RecipeBody (all fields optional) | `{ recipe: RecipeDetail }` |
| DELETE | `/api/recipes/:id` | owner/admin | – | `204` |
| POST | `/api/recipes/:id/photos` | owner/admin | multipart, field **`file`** (image/jpeg,png,webp,gif, ≤5MB) | `201 { photo: { id, recipeId, url, position, key } }` |

`/api/recipes/:idOrSlug` (GET): guests/anyone see published recipes by id or
slug; the author or an admin may also fetch their **own non-published** recipe by
numeric id (e.g. preview a pending submission). Otherwise `404`.

**RecipeBody:**
```json
{
  "title": "string (required on create)",
  "description": "string?",
  "cuisineId": "number|null?",
  "prepTimeMin": "number|null?", "cookTimeMin": "number|null?",
  "calories": "number|null?", "difficulty": "easy|medium|hard|null?",
  "servings": "number|null?",
  "vegan": "bool?", "vegetarian": "bool?", "glutenFree": "bool?", "lactoseFree": "bool?",
  "categoryIds": "number[]?", "tagIds": "number[]?",
  "ingredients": [ { "ingredientId": 10, "quantity": "200?", "unit": "g?" } ],
  "steps": [ { "text": "…", "photoUrl": "url?" } ]
}
```
On PUT, any provided child array (`ingredients`/`steps`/`categoryIds`/`tagIds`)
**replaces** that set entirely; omitted arrays are left unchanged. The
denormalized non-basic `ingredient_ids` used by smart selection is maintained by
DB triggers — no client action needed.

## Search  (module: search) — guest

`GET /api/search` — full-text + faceted filters. All query params optional.

| Param | Meaning |
|---|---|
| `q` | full-text query (title^A, description^B; `websearch_to_tsquery`) |
| `category` | category id |
| `tag` | tag id |
| `cuisine` | cuisine id |
| `ingredients` | comma-separated ingredient ids; recipe must require **all** (non-basic) |
| `maxPrepTime` | prep_time_min ≤ value |
| `maxCalories` | calories ≤ value |
| `difficulty` | `easy\|medium\|hard` |
| `vegan`,`vegetarian`,`glutenFree`,`lactoseFree` | `true`/`1` to require the flag |
| `page`,`pageSize` | pagination |

Returns a Page of RecipeSummary (published only). Ranked by text relevance when
`q` is present, else newest first.

## Discovery  (module: discovery)

| Method | Path | Role | Body / Query | Response |
|---|---|---|---|---|
| POST | `/api/smart-selection` | guest | `{ ingredientIds: number[], limit?: number }` | `{ items: [ { recipe: RecipeSummary, missingCount, missingIngredientIds: number[], canCookNow } ] }` |
| GET | `/api/recommendations` | registered | `?limit` (default 20) | `{ items: [ { recipe: RecipeSummary, score } ] }` |

- **smart-selection:** `ingredientIds` = non-basic ids the user has on hand.
  Basics (`is_basic`) are always-available and excluded from the missing count by
  construction. Ranked by fewest missing required ingredients, then rating.
  `canCookNow` = `missingCount === 0`.
- **recommendations:** content-based from the caller's cooked + favorited
  recipes (weighted category/tag/cuisine overlap). Excludes already-engaged
  recipes, recipes containing the user's allergens/disliked ingredients, and
  recipes violating the user's diet preferences (if user is vegan, only vegan
  recipes, etc.). Ranked by score then rating.

## Social  (module: social)

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| GET | `/api/recipes/:id/comments` | guest | – | `{ items: Comment[] }` (visible only) |
| POST | `/api/recipes/:id/comments` | registered | `{ rating?: 1–5, body?: string }` (at least one) | `201 { comment }` |
| PUT | `/api/recipes/:id/favorite` | registered | – | `{ ok, favorited: true }` |
| DELETE | `/api/recipes/:id/favorite` | registered | – | `{ ok, favorited: false }` |
| GET | `/api/me/favorites` | registered | – | `{ items: RecipeSummary[] }` |
| PUT | `/api/recipes/:id/cook-status` | registered | `{ status: "cooked"\|"want_to_cook" }` | `{ ok, status }` |
| DELETE | `/api/recipes/:id/cook-status` | registered | – | `{ ok, status: null }` |
| GET | `/api/me/history` | registered | – | `{ items: [ { recipe: RecipeSummary, cookedAt } ] }` (status=cooked, newest first) |
| GET | `/api/me/want-to-cook` | registered | – | `{ items: [ { recipe: RecipeSummary, markedAt } ] }` |
| POST | `/api/subscriptions/:authorId` | registered | – | `{ ok, subscribed: true }` |
| DELETE | `/api/subscriptions/:authorId` | registered | – | `{ ok, subscribed: false }` |
| GET | `/api/me/subscriptions` | registered | – | `{ items: [ { authorId, displayName, avatarUrl, bio, since } ] }` |

`Comment` = `{ id, recipeId, userId, authorName, rating, body, status, createdAt }`.
Posting a comment/rating writes an in-app notification to the recipe author (unless
self) in the same transaction.

## Notifications  (module: notifications) — registered, in-app

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/me/notifications` | `?unread=true` for unread only | `{ items: Notification[], unreadCount }` |
| POST | `/api/me/notifications/:id/read` | – | `{ ok: true }` |
| POST | `/api/me/notifications/read-all` | – | `{ ok: true, updated: N }` |

`Notification` = `{ id, type, payload, read, readAt, createdAt }`. `type` ∈
`new_comment`, `new_rating`, `new_recipe_from_author`. Payloads:
- `new_comment` / `new_rating`: `{ recipeId, commentId, fromUserId, rating|null }`
- `new_recipe_from_author`: `{ recipeId, recipeTitle, recipeSlug, authorId }`

## Complaints (file) — registered

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/complaints` | `{ targetType: "recipe"\|"user"\|"comment", targetId, reason }` | `201 { complaint: { id } }` |

## Admin  (module: moderation + catalog + stats) — `/api/admin/*`, admin only

### Stats
| Method | Path | Response |
|---|---|---|
| GET | `/api/admin/stats` | `{ recipes:{total,published,pending,hidden,draft}, users:{total,active,blocked,admins,authors}, engagement:{comments,ratings,favorites,cookedMarks,subscriptions}, moderation:{openComplaints,pendingRecipes,hiddenComments}, popularCategories:[{categoryId,name,recipeCount}], topRatedRecipes:[{recipeId,title,averageRating,ratingCount}], mostActiveUsers:[{userId,displayName,recipeCount,commentCount}] }` |

### Moderation: submissions & recipes
| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/api/admin/submissions` | – | `{ items: RecipeSummary[] }` (status=pending) |
| POST | `/api/admin/recipes/:id/approve` | – | `{ recipe: RecipeSummary }` (→ published, fires subscriber notifications on first publish) |
| POST | `/api/admin/recipes/:id/hide` | – | `{ recipe: RecipeSummary }` (→ hidden, soft) |
| POST | `/api/admin/recipes/:id/unhide` | – | `{ recipe: RecipeSummary }` (→ published) |
| GET | `/api/admin/recipes` | `?status=draft\|pending\|published\|hidden` | `{ items: RecipeSummary[] }` (all statuses) |
| GET | `/api/admin/recipes/:id` | – | `{ recipe: RecipeDetail }` |
| POST | `/api/admin/recipes` | AdminRecipeBody (RecipeBody + `status?`) | `201 { recipe: RecipeDetail }` |
| PUT | `/api/admin/recipes/:id` | AdminRecipeBody (partial; `status?` applied) | `{ recipe: RecipeDetail }` |
| DELETE | `/api/admin/recipes/:id` | – | `204` (hard delete; use hide for soft) |

### Moderation: comments
| Method | Path | Response |
|---|---|---|
| POST | `/api/admin/comments/:id/hide` | `{ ok: true }` (soft-hide) |
| POST | `/api/admin/comments/:id/unhide` | `{ ok: true }` |
| DELETE | `/api/admin/comments/:id` | `204` |

### Complaints
| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/admin/complaints` | `?status=open\|resolved` | `{ items: [ { id, reporterId, reporterName, targetType, targetId, reason, status, createdAt } ] }` |
| POST | `/api/admin/complaints/:id/resolve` | – | `{ ok: true }` |

### Users
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/admin/users` | – | `{ items: AdminUserView[] }` |
| GET | `/api/admin/users/:id` | – | `{ user: AdminUserView }` |
| POST | `/api/admin/users/:id/block` | – | `{ ok, status: "blocked" }` |
| POST | `/api/admin/users/:id/unblock` | – | `{ ok, status: "active" }` |
| PUT | `/api/admin/users/:id/role` | `{ role: "registered"\|"admin" }` | `{ ok, role }` |
| DELETE | `/api/admin/users/:id` | – | `204` |

`AdminUserView` = PublicUser fields + `recipeCount`.

### Taxonomy CRUD
| Method | Path | Body |
|---|---|---|
| POST/PUT/DELETE | `/api/admin/categories[/:id]` | `{ name, description? }` |
| POST/PUT/DELETE | `/api/admin/tags[/:id]` | `{ name }` |
| POST/PUT/DELETE | `/api/admin/cuisines[/:id]` | `{ name }` |
| POST/PUT/DELETE | `/api/admin/ingredients[/:id]` | `{ name, isBasic? }` |

POST → `201 { <entity> }`; PUT → `200 { <entity> }`; DELETE → `204`. Slugs are
auto-generated from `name`. Deleting an ingredient that is referenced by a recipe
returns `409` (FK RESTRICT). Flipping `ingredients.isBasic` re-syncs affected
recipes' `ingredient_ids` via a DB trigger.

## Root routes (not under `/api`)

| Method | Path | Notes |
|---|---|---|
| GET | `/healthz`, `/readyz` | liveness/readiness probes |
| GET | `/r/:slug` | public share page: HTML with Open Graph + Twitter Card meta for a published recipe |
| GET | `/media/*` | serves uploaded media files (local BlobStore in dev) |

## Media

Photo uploads stream to a `BlobStore` (interface in
`api/src/platform/storage.ts`). Phase-1 dev uses the **local-filesystem driver**
(`STORAGE_LOCAL_DIR`, default `./.storage`), served at
`${PUBLIC_BASE_URL}/media/<key>`. Allowed types: jpeg, png, webp, gif; max 5 MB.
The interface is the seam for the GCS signed-URL prod target.
