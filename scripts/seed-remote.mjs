// Populate a DEPLOYED instance with demo taxonomy + published recipes via the
// public HTTP API (no DB access needed). Idempotent: existing taxonomy/recipes
// are matched by name/title and skipped.
//
// Usage:
//   BASE_URL=https://your-app.onrender.com \
//   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret \
//   node scripts/seed-remote.mjs
//
// Requires Node 22+ (global fetch/FormData/Blob).

const BASE = (process.env.BASE_URL || "").replace(/\/+$/, "");
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const WITH_PHOTOS = process.env.WITH_PHOTOS !== "false";

if (!BASE || !EMAIL || !PASSWORD) {
  console.error("Set BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD env vars.");
  process.exit(1);
}

let token = null;

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  }
  return data;
}

/** Ensure each name exists in a taxonomy collection; return Map<name, id>. */
async function ensureTaxonomy(listPath, createPath, key, names, extra = () => ({})) {
  const existing = (await api(listPath)).items;
  const byName = new Map(existing.map((x) => [x.name.toLowerCase(), x.id]));
  for (const entry of names) {
    const name = typeof entry === "string" ? entry : entry.name;
    if (byName.has(name.toLowerCase())) continue;
    const created = await api(createPath, {
      method: "POST",
      body: { name, ...extra(entry) },
    });
    byName.set(name.toLowerCase(), created[key].id);
    process.stdout.write(`  + ${key}: ${name}\n`);
  }
  return byName;
}

async function uploadPhoto(recipeId, slug) {
  try {
    const img = await fetch(`https://picsum.photos/seed/${slug}/800/600`);
    if (!img.ok) throw new Error(`image fetch ${img.status}`);
    const buf = Buffer.from(await img.arrayBuffer());
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type: "image/jpeg" }), `${slug}.jpg`);
    const res = await fetch(`${BASE}/api/recipes/${recipeId}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) throw new Error(`upload ${res.status} ${await res.text()}`);
    process.stdout.write(`    · photo uploaded\n`);
  } catch (err) {
    process.stdout.write(`    · photo skipped (${err.message})\n`);
  }
}

// ---- Demo content ---------------------------------------------------------
const CUISINES = ["Italian", "Mexican", "Indian", "American", "Mediterranean"];
const CATEGORIES = ["Breakfast", "Main Course", "Dessert", "Salad", "Soup"];
const TAGS = ["quick", "healthy", "comfort-food", "budget", "kid-friendly", "high-protein"];

const BASIC = ["Salt", "Black Pepper", "Olive Oil", "Sugar", "Garlic", "Onion", "Butter", "All-Purpose Flour", "Water"];
const NORMAL = [
  "Spaghetti", "Egg", "Bacon", "Parmesan", "Black Beans", "Tortilla", "Avocado", "Lime",
  "Chili Powder", "Cumin", "Chickpeas", "Coconut Milk", "Spinach", "Ginger", "Rice", "Milk",
  "Cucumber", "Tomato", "Lettuce", "Lemon", "Cocoa Powder", "Vanilla Extract",
];

const RECIPES = [
  {
    title: "Spaghetti Carbonara", cuisine: "Italian", categories: ["Main Course"],
    tags: ["comfort-food", "quick"], difficulty: "medium", prepTimeMin: 10, cookTimeMin: 15,
    calories: 650, servings: 2, dietary: { lactoseFree: false },
    description: "Classic Roman pasta with egg, crispy bacon, and black pepper. No cream — just a silky emulsion.",
    ingredients: [["Spaghetti", "200", "g"], ["Egg", "3", "pcs"], ["Bacon", "120", "g"], ["Parmesan", "50", "g"], ["Black Pepper", "1", "tsp"], ["Salt", "to taste"]],
    steps: ["Boil the spaghetti in well-salted water until al dente.", "Fry the bacon until crisp; reserve the fat.", "Whisk eggs with grated parmesan and black pepper.", "Toss hot pasta with bacon, then the egg mixture off heat to emulsify.", "Serve immediately with extra parmesan."],
  },
  {
    title: "Black Bean Tacos", cuisine: "Mexican", categories: ["Main Course", "Snack"].filter((c) => CATEGORIES.includes(c)),
    tags: ["budget", "quick", "healthy"], difficulty: "easy", prepTimeMin: 10, cookTimeMin: 10,
    calories: 420, servings: 3, dietary: { vegan: true, vegetarian: true, lactoseFree: true },
    description: "Smoky black bean tacos with avocado and lime. Ready in twenty minutes and easy on the wallet.",
    ingredients: [["Black Beans", "1", "can"], ["Tortilla", "6", "pcs"], ["Avocado", "1", "pcs"], ["Lime", "1", "pcs"], ["Chili Powder", "1", "tsp"], ["Cumin", "1", "tsp"], ["Onion", "1", "pcs"]],
    steps: ["Saute onion until soft.", "Add drained black beans, chili powder, and cumin; mash lightly.", "Warm the tortillas.", "Fill with beans, sliced avocado, and a squeeze of lime."],
  },
  {
    title: "Chickpea Coconut Curry", cuisine: "Indian", categories: ["Main Course"],
    tags: ["healthy", "comfort-food"], difficulty: "medium", prepTimeMin: 15, cookTimeMin: 25,
    calories: 540, servings: 4, dietary: { vegan: true, vegetarian: true, glutenFree: true, lactoseFree: true },
    description: "A creamy, fragrant vegan curry with chickpeas and spinach in coconut milk. Serve over rice.",
    ingredients: [["Chickpeas", "2", "cans"], ["Coconut Milk", "1", "can"], ["Spinach", "2", "cups"], ["Garlic", "3", "cloves"], ["Ginger", "1", "tbsp"], ["Cumin", "1", "tsp"], ["Onion", "1", "pcs"], ["Rice", "2", "cups"]],
    steps: ["Saute onion, garlic, and ginger.", "Add spices and bloom for a minute.", "Stir in chickpeas and coconut milk; simmer 15 minutes.", "Fold in spinach until wilted.", "Serve over steamed rice."],
  },
  {
    title: "Fluffy Pancakes", cuisine: "American", categories: ["Breakfast"],
    tags: ["kid-friendly", "comfort-food"], difficulty: "easy", prepTimeMin: 10, cookTimeMin: 15,
    calories: 480, servings: 4, dietary: { vegetarian: true, lactoseFree: false },
    description: "Tall, fluffy buttermilk-style pancakes. A weekend breakfast staple the whole family loves.",
    ingredients: [["All-Purpose Flour", "2", "cups"], ["Milk", "1.5", "cups"], ["Egg", "2", "pcs"], ["Sugar", "2", "tbsp"], ["Butter", "2", "tbsp"]],
    steps: ["Whisk dry ingredients together.", "Mix in milk, eggs, and melted butter until just combined.", "Cook ladlefuls on a hot griddle until bubbles form, then flip.", "Serve warm with syrup."],
  },
  {
    title: "Greek Salad", cuisine: "Mediterranean", categories: ["Salad"],
    tags: ["healthy", "quick"], difficulty: "easy", prepTimeMin: 15, cookTimeMin: 0,
    calories: 220, servings: 2, dietary: { vegetarian: true, glutenFree: true, lactoseFree: true },
    description: "Crisp cucumber, tomato, and lettuce with a bright lemon-olive-oil dressing. Light and refreshing.",
    ingredients: [["Cucumber", "1", "pcs"], ["Tomato", "2", "pcs"], ["Lettuce", "1", "head"], ["Lemon", "1", "pcs"], ["Olive Oil", "2", "tbsp"], ["Salt", "to taste"]],
    steps: ["Chop the vegetables into bite-sized pieces.", "Whisk lemon juice with olive oil and salt.", "Toss everything together and serve."],
  },
  {
    title: "Chocolate Mug Cake", cuisine: "American", categories: ["Dessert"],
    tags: ["quick", "kid-friendly"], difficulty: "easy", prepTimeMin: 5, cookTimeMin: 2,
    calories: 350, servings: 1, dietary: { vegetarian: true, lactoseFree: false },
    description: "A single-serving chocolate cake in the microwave. Dangerously quick dessert.",
    ingredients: [["All-Purpose Flour", "4", "tbsp"], ["Cocoa Powder", "2", "tbsp"], ["Sugar", "3", "tbsp"], ["Milk", "3", "tbsp"], ["Vanilla Extract", "0.5", "tsp"], ["Butter", "1", "tbsp"]],
    steps: ["Mix all ingredients in a mug until smooth.", "Microwave 90 seconds.", "Let cool a minute and eat."],
  },
];

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function main() {
  console.log(`Logging in as ${EMAIL} @ ${BASE} ...`);
  ({ token } = await api("/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } }));

  console.log("Ensuring taxonomy ...");
  const cuisineId = await ensureTaxonomy("/cuisines", "/admin/cuisines", "cuisine", CUISINES);
  const categoryId = await ensureTaxonomy("/categories", "/admin/categories", "category", CATEGORIES);
  const tagId = await ensureTaxonomy("/tags", "/admin/tags", "tag", TAGS);
  const ingId = await ensureTaxonomy(
    "/ingredients", "/admin/ingredients", "ingredient",
    [...BASIC.map((n) => ({ name: n, isBasic: true })), ...NORMAL.map((n) => ({ name: n, isBasic: false }))],
    (e) => ({ isBasic: e.isBasic }),
  );

  console.log("Creating recipes ...");
  const existingTitles = new Set((await api("/admin/recipes")).items.map((r) => r.title.toLowerCase()));

  for (const r of RECIPES) {
    if (existingTitles.has(r.title.toLowerCase())) {
      console.log(`  = exists, skipping: ${r.title}`);
      continue;
    }
    const body = {
      title: r.title,
      description: r.description,
      status: "published",
      cuisineId: cuisineId.get(r.cuisine.toLowerCase()) ?? null,
      prepTimeMin: r.prepTimeMin, cookTimeMin: r.cookTimeMin, calories: r.calories,
      difficulty: r.difficulty, servings: r.servings,
      vegan: !!r.dietary.vegan, vegetarian: !!r.dietary.vegetarian,
      glutenFree: !!r.dietary.glutenFree, lactoseFree: !!r.dietary.lactoseFree,
      categoryIds: r.categories.map((c) => categoryId.get(c.toLowerCase())).filter(Boolean),
      tagIds: r.tags.map((t) => tagId.get(t.toLowerCase())).filter(Boolean),
      ingredients: r.ingredients.map(([name, quantity, unit]) => ({
        ingredientId: ingId.get(name.toLowerCase()), quantity, unit,
      })).filter((i) => i.ingredientId),
      steps: r.steps.map((text) => ({ text })),
    };
    const { recipe } = await api("/admin/recipes", { method: "POST", body });
    console.log(`  + recipe: ${r.title} (id=${recipe.id}, ${recipe.status})`);
    if (WITH_PHOTOS) await uploadPhoto(recipe.id, slugify(r.title));
  }

  const total = (await api("/recipes?pageSize=1")).total;
  console.log(`\nDone. Public catalog now has ${total} published recipe(s).`);
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
