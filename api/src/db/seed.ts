/**
 * Idempotent seed. Safe to re-run: it TRUNCATEs every table (RESTART IDENTITY
 * CASCADE) and re-inserts a small, coherent data set.
 *
 * Run via:  pnpm --filter @app/api seed
 * (package.json wires this to: tsx --env-file=../.env src/db/seed.ts)
 *
 * Creates:
 *  - 1 admin (argon2 hash of ADMIN_EMAIL / ADMIN_PASSWORD) + 3 normal users
 *  - categories, tags, cuisines
 *  - basic ingredients (is_basic=true) + normal ingredients
 *  - 8 PUBLISHED recipes with ingredients, steps, photo URLs, dietary flags
 *  - comments/ratings, favorites, cook_status rows, a subscription, a notification
 */

import argon2 from "argon2";
import { sql } from "drizzle-orm";

import { db, pool } from "./index.js";
import {
  categories,
  comments,
  cookStatus,
  cuisines,
  favorites,
  ingredients,
  notifications,
  recipeCategories,
  recipeIngredients,
  recipeTags,
  recipes,
  steps,
  subscriptions,
  tags,
  userPreferences,
  users,
} from "./schema.js";

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const PLACEHOLDER = (seed: string): string =>
  `https://picsum.photos/seed/${seed}/800/600`;

async function truncateAll(): Promise<void> {
  // One statement, CASCADE handles FK order; RESTART IDENTITY resets bigserials.
  await db.execute(sql`
    TRUNCATE TABLE
      complaints, notifications, subscriptions, comments, cook_status, favorites,
      recipe_tags, recipe_categories, photos, steps, recipe_ingredients, recipes,
      ingredients, cuisines, tags, categories, user_preferences, users
    RESTART IDENTITY CASCADE
  `);
}

async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin12345";

  console.log("Truncating existing data ...");
  await truncateAll();

  /* ---- Users ----------------------------------------------------------- */
  console.log("Seeding users ...");
  const adminHash = await argon2.hash(adminPassword);
  const userHash = await argon2.hash("password123");

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        email: adminEmail,
        passwordHash: adminHash,
        displayName: "Site Admin",
        role: "admin",
        status: "active",
        bio: "Keeps the kitchen tidy.",
      },
      {
        email: "alice@example.com",
        passwordHash: userHash,
        displayName: "Alice Baker",
        bio: "Weeknight dinners and too much garlic.",
      },
      {
        email: "bob@example.com",
        passwordHash: userHash,
        displayName: "Bob Stew",
        bio: "Slow cooker enthusiast.",
      },
      {
        email: "carol@example.com",
        passwordHash: userHash,
        displayName: "Carol Vega",
        bio: "Plant-based and proud.",
      },
    ])
    .returning({ id: users.id, email: users.email });

  const userId = (email: string): number => {
    const u = insertedUsers.find((x) => x.email === email);
    if (!u) throw new Error(`seed: user not found: ${email}`);
    return u.id;
  };
  const admin = userId(adminEmail);
  const alice = userId("alice@example.com");
  const bob = userId("bob@example.com");
  const carol = userId("carol@example.com");

  await db.insert(userPreferences).values([
    { userId: admin },
    { userId: alice, glutenFree: true, allergies: [] },
    { userId: bob },
    { userId: carol, vegan: true, vegetarian: true },
  ]);

  /* ---- Taxonomy -------------------------------------------------------- */
  console.log("Seeding categories / tags / cuisines ...");
  const catRows = await db
    .insert(categories)
    .values(
      ["Breakfast", "Main Course", "Dessert", "Salad", "Soup", "Snack"].map(
        (name) => ({ name, slug: slugify(name) }),
      ),
    )
    .returning({ id: categories.id, name: categories.name });
  const cat = (name: string): number => {
    const c = catRows.find((x) => x.name === name);
    if (!c) throw new Error(`seed: category not found: ${name}`);
    return c.id;
  };

  const tagRows = await db
    .insert(tags)
    .values(
      [
        "quick",
        "comfort-food",
        "healthy",
        "spicy",
        "budget",
        "high-protein",
        "kid-friendly",
      ].map((name) => ({ name, slug: slugify(name) })),
    )
    .returning({ id: tags.id, name: tags.name });
  const tag = (name: string): number => {
    const t = tagRows.find((x) => x.name === name);
    if (!t) throw new Error(`seed: tag not found: ${name}`);
    return t.id;
  };

  const cuisineRows = await db
    .insert(cuisines)
    .values(
      ["Italian", "Mexican", "Indian", "Japanese", "American", "Mediterranean"].map(
        (name) => ({ name, slug: slugify(name) }),
      ),
    )
    .returning({ id: cuisines.id, name: cuisines.name });
  const cuisine = (name: string): number => {
    const c = cuisineRows.find((x) => x.name === name);
    if (!c) throw new Error(`seed: cuisine not found: ${name}`);
    return c.id;
  };

  /* ---- Ingredients ----------------------------------------------------- */
  console.log("Seeding ingredients ...");
  const basicNames = [
    "Salt",
    "Black Pepper",
    "Olive Oil",
    "Water",
    "Sugar",
    "Garlic",
    "Onion",
    "Butter",
    "All-Purpose Flour",
  ];
  const normalNames = [
    "Spaghetti",
    "Tomato",
    "Basil",
    "Parmesan",
    "Egg",
    "Bacon",
    "Chicken Breast",
    "Rice",
    "Black Beans",
    "Tortilla",
    "Avocado",
    "Lime",
    "Chili Powder",
    "Cumin",
    "Coconut Milk",
    "Chickpeas",
    "Spinach",
    "Tofu",
    "Soy Sauce",
    "Ginger",
    "Cheddar Cheese",
    "Lettuce",
    "Cucumber",
    "Lemon",
    "Carrot",
    "Potato",
    "Ground Beef",
    "Milk",
    "Vanilla Extract",
    "Cocoa Powder",
    "Bell Pepper",
  ];

  const ingRows = await db
    .insert(ingredients)
    .values([
      ...basicNames.map((name) => ({
        name,
        slug: slugify(name),
        isBasic: true,
      })),
      ...normalNames.map((name) => ({
        name,
        slug: slugify(name),
        isBasic: false,
      })),
    ])
    .returning({ id: ingredients.id, name: ingredients.name });
  const ing = (name: string): number => {
    const i = ingRows.find((x) => x.name === name);
    if (!i) throw new Error(`seed: ingredient not found: ${name}`);
    return i.id;
  };

  /* ---- Recipes --------------------------------------------------------- */
  console.log("Seeding recipes ...");

  type RecipeSeed = {
    author: number;
    title: string;
    description: string;
    cuisine: number;
    prepTimeMin: number;
    cookTimeMin: number;
    calories: number;
    difficulty: "easy" | "medium" | "hard";
    servings: number;
    vegan?: boolean;
    vegetarian?: boolean;
    glutenFree?: boolean;
    lactoseFree?: boolean;
    categories: number[];
    tags: number[];
    ingredients: Array<{ name: string; quantity?: string; unit?: string }>;
    steps: string[];
    photos: number;
  };

  const recipeSeeds: RecipeSeed[] = [
    {
      author: alice,
      title: "Spaghetti Carbonara",
      description:
        "Classic Roman pasta with egg, crispy bacon, and plenty of black pepper. No cream — just silky emulsion.",
      cuisine: cuisine("Italian"),
      prepTimeMin: 10,
      cookTimeMin: 15,
      calories: 650,
      difficulty: "medium",
      servings: 2,
      vegetarian: false,
      lactoseFree: false,
      categories: [cat("Main Course")],
      tags: [tag("comfort-food"), tag("quick")],
      ingredients: [
        { name: "Spaghetti", quantity: "200", unit: "g" },
        { name: "Egg", quantity: "3", unit: "pcs" },
        { name: "Bacon", quantity: "120", unit: "g" },
        { name: "Parmesan", quantity: "50", unit: "g" },
        { name: "Black Pepper", quantity: "1", unit: "tsp" },
        { name: "Salt", quantity: "to taste" },
      ],
      steps: [
        "Boil the spaghetti in well-salted water until al dente.",
        "Fry the bacon until crisp; reserve the fat.",
        "Whisk eggs with grated parmesan and black pepper.",
        "Toss hot pasta with bacon, then the egg mixture off heat to emulsify.",
        "Serve immediately with extra parmesan.",
      ],
      photos: 2,
    },
    {
      author: bob,
      title: "Black Bean Tacos",
      description:
        "Smoky black bean tacos with avocado and lime. Ready in twenty minutes and easy on the wallet.",
      cuisine: cuisine("Mexican"),
      prepTimeMin: 10,
      cookTimeMin: 10,
      calories: 420,
      difficulty: "easy",
      servings: 3,
      vegan: true,
      vegetarian: true,
      glutenFree: false,
      lactoseFree: true,
      categories: [cat("Main Course"), cat("Snack")],
      tags: [tag("budget"), tag("quick"), tag("healthy")],
      ingredients: [
        { name: "Black Beans", quantity: "1", unit: "can" },
        { name: "Tortilla", quantity: "6", unit: "pcs" },
        { name: "Avocado", quantity: "1", unit: "pcs" },
        { name: "Lime", quantity: "1", unit: "pcs" },
        { name: "Chili Powder", quantity: "1", unit: "tsp" },
        { name: "Cumin", quantity: "1", unit: "tsp" },
        { name: "Onion", quantity: "1", unit: "pcs" },
      ],
      steps: [
        "Saute onion until soft.",
        "Add drained black beans, chili powder, and cumin; mash lightly.",
        "Warm the tortillas.",
        "Fill with beans, sliced avocado, and a squeeze of lime.",
      ],
      photos: 1,
    },
    {
      author: carol,
      title: "Chickpea Coconut Curry",
      description:
        "A creamy, fragrant vegan curry with chickpeas and spinach in coconut milk. Serve over rice.",
      cuisine: cuisine("Indian"),
      prepTimeMin: 15,
      cookTimeMin: 25,
      calories: 540,
      difficulty: "medium",
      servings: 4,
      vegan: true,
      vegetarian: true,
      glutenFree: true,
      lactoseFree: true,
      categories: [cat("Main Course")],
      tags: [tag("healthy"), tag("comfort-food")],
      ingredients: [
        { name: "Chickpeas", quantity: "2", unit: "cans" },
        { name: "Coconut Milk", quantity: "1", unit: "can" },
        { name: "Spinach", quantity: "2", unit: "cups" },
        { name: "Garlic", quantity: "3", unit: "cloves" },
        { name: "Ginger", quantity: "1", unit: "tbsp" },
        { name: "Cumin", quantity: "1", unit: "tsp" },
        { name: "Onion", quantity: "1", unit: "pcs" },
        { name: "Rice", quantity: "2", unit: "cups" },
      ],
      steps: [
        "Saute onion, garlic, and ginger.",
        "Add spices and bloom for a minute.",
        "Stir in chickpeas and coconut milk; simmer 15 minutes.",
        "Fold in spinach until wilted.",
        "Serve over steamed rice.",
      ],
      photos: 2,
    },
    {
      author: alice,
      title: "Fluffy Pancakes",
      description:
        "Tall, fluffy buttermilk-style pancakes. A weekend breakfast staple the whole family loves.",
      cuisine: cuisine("American"),
      prepTimeMin: 10,
      cookTimeMin: 15,
      calories: 480,
      difficulty: "easy",
      servings: 4,
      vegetarian: true,
      lactoseFree: false,
      categories: [cat("Breakfast")],
      tags: [tag("kid-friendly"), tag("comfort-food")],
      ingredients: [
        { name: "All-Purpose Flour", quantity: "2", unit: "cups" },
        { name: "Milk", quantity: "1.5", unit: "cups" },
        { name: "Egg", quantity: "2", unit: "pcs" },
        { name: "Sugar", quantity: "2", unit: "tbsp" },
        { name: "Butter", quantity: "2", unit: "tbsp" },
      ],
      steps: [
        "Whisk dry ingredients together.",
        "Mix in milk, eggs, and melted butter until just combined.",
        "Cook ladlefuls on a hot griddle until bubbles form, then flip.",
        "Serve warm with syrup.",
      ],
      photos: 1,
    },
    {
      author: bob,
      title: "Chicken Fried Rice",
      description:
        "Quick weeknight fried rice with chicken, egg, and soy sauce. Great way to use leftover rice.",
      cuisine: cuisine("Japanese"),
      prepTimeMin: 15,
      cookTimeMin: 15,
      calories: 590,
      difficulty: "easy",
      servings: 3,
      glutenFree: false,
      lactoseFree: true,
      categories: [cat("Main Course")],
      tags: [tag("quick"), tag("high-protein"), tag("budget")],
      ingredients: [
        { name: "Rice", quantity: "3", unit: "cups" },
        { name: "Chicken Breast", quantity: "300", unit: "g" },
        { name: "Egg", quantity: "2", unit: "pcs" },
        { name: "Soy Sauce", quantity: "3", unit: "tbsp" },
        { name: "Carrot", quantity: "1", unit: "pcs" },
        { name: "Garlic", quantity: "2", unit: "cloves" },
      ],
      steps: [
        "Scramble the eggs and set aside.",
        "Brown diced chicken with garlic.",
        "Add carrots and cold rice; stir-fry over high heat.",
        "Return eggs, add soy sauce, and toss to combine.",
      ],
      photos: 1,
    },
    {
      author: carol,
      title: "Greek Salad",
      description:
        "Crisp cucumber, tomato, and lettuce with a bright lemon-olive-oil dressing. Light and refreshing.",
      cuisine: cuisine("Mediterranean"),
      prepTimeMin: 15,
      cookTimeMin: 0,
      calories: 220,
      difficulty: "easy",
      servings: 2,
      vegetarian: true,
      glutenFree: true,
      lactoseFree: true,
      categories: [cat("Salad")],
      tags: [tag("healthy"), tag("quick")],
      ingredients: [
        { name: "Cucumber", quantity: "1", unit: "pcs" },
        { name: "Tomato", quantity: "2", unit: "pcs" },
        { name: "Lettuce", quantity: "1", unit: "head" },
        { name: "Lemon", quantity: "1", unit: "pcs" },
        { name: "Olive Oil", quantity: "2", unit: "tbsp" },
        { name: "Salt", quantity: "to taste" },
      ],
      steps: [
        "Chop the vegetables into bite-sized pieces.",
        "Whisk lemon juice with olive oil and salt.",
        "Toss everything together and serve.",
      ],
      photos: 1,
    },
    {
      author: alice,
      title: "Classic Beef Chili",
      description:
        "A hearty, spicy beef chili with beans. Even better the next day.",
      cuisine: cuisine("American"),
      prepTimeMin: 15,
      cookTimeMin: 45,
      calories: 610,
      difficulty: "medium",
      servings: 5,
      glutenFree: true,
      lactoseFree: true,
      categories: [cat("Soup"), cat("Main Course")],
      tags: [tag("comfort-food"), tag("spicy"), tag("high-protein")],
      ingredients: [
        { name: "Ground Beef", quantity: "500", unit: "g" },
        { name: "Black Beans", quantity: "2", unit: "cans" },
        { name: "Tomato", quantity: "3", unit: "pcs" },
        { name: "Chili Powder", quantity: "2", unit: "tbsp" },
        { name: "Cumin", quantity: "1", unit: "tbsp" },
        { name: "Onion", quantity: "1", unit: "pcs" },
        { name: "Garlic", quantity: "3", unit: "cloves" },
        { name: "Bell Pepper", quantity: "1", unit: "pcs" },
      ],
      steps: [
        "Brown the beef with onion and garlic.",
        "Add peppers and spices; cook briefly.",
        "Stir in tomatoes and beans; simmer 40 minutes.",
        "Adjust seasoning and serve.",
      ],
      photos: 2,
    },
    {
      author: carol,
      title: "Chocolate Mug Cake",
      description:
        "A single-serving chocolate cake in the microwave. Dangerously quick dessert.",
      cuisine: cuisine("American"),
      prepTimeMin: 5,
      cookTimeMin: 2,
      calories: 350,
      difficulty: "easy",
      servings: 1,
      vegetarian: true,
      lactoseFree: false,
      categories: [cat("Dessert")],
      tags: [tag("quick"), tag("kid-friendly")],
      ingredients: [
        { name: "All-Purpose Flour", quantity: "4", unit: "tbsp" },
        { name: "Cocoa Powder", quantity: "2", unit: "tbsp" },
        { name: "Sugar", quantity: "3", unit: "tbsp" },
        { name: "Milk", quantity: "3", unit: "tbsp" },
        { name: "Vanilla Extract", quantity: "0.5", unit: "tsp" },
        { name: "Butter", quantity: "1", unit: "tbsp" },
      ],
      steps: [
        "Mix all ingredients in a mug until smooth.",
        "Microwave 90 seconds.",
        "Let cool a minute and eat.",
      ],
      photos: 1,
    },
  ];

  const now = new Date();
  let recipeIndex = 0;
  const recipeIds: number[] = [];

  for (const r of recipeSeeds) {
    recipeIndex += 1;
    const [inserted] = await db
      .insert(recipes)
      .values({
        authorId: r.author,
        title: r.title,
        slug: slugify(r.title),
        description: r.description,
        cuisineId: r.cuisine,
        status: "published",
        publishedAt: now,
        prepTimeMin: r.prepTimeMin,
        cookTimeMin: r.cookTimeMin,
        calories: r.calories,
        difficulty: r.difficulty,
        servings: r.servings,
        vegan: r.vegan ?? false,
        vegetarian: r.vegetarian ?? r.vegan ?? false,
        glutenFree: r.glutenFree ?? false,
        lactoseFree: r.lactoseFree ?? false,
      })
      .returning({ id: recipes.id });
    if (!inserted) throw new Error(`seed: failed to insert recipe ${r.title}`);
    const rid = inserted.id;
    recipeIds.push(rid);

    await db.insert(recipeIngredients).values(
      r.ingredients.map((item, idx) => ({
        recipeId: rid,
        ingredientId: ing(item.name),
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        position: idx,
      })),
    );

    await db.insert(steps).values(
      r.steps.map((text, idx) => ({
        recipeId: rid,
        position: idx + 1,
        text,
        photoUrl: idx === 0 ? PLACEHOLDER(`step-${rid}-${idx}`) : null,
      })),
    );

    await db.insert(recipeCategories).values(
      r.categories.map((categoryId) => ({ recipeId: rid, categoryId })),
    );
    await db
      .insert(recipeTags)
      .values(r.tags.map((tagId) => ({ recipeId: rid, tagId })));

    // photos table
    const photoValues = Array.from({ length: r.photos }, (_, idx) => ({
      recipeId: rid,
      url: PLACEHOLDER(`recipe-${rid}-${idx}`),
      position: idx,
    }));
    await db.execute(sql`
      INSERT INTO photos (recipe_id, url, position)
      SELECT * FROM (VALUES ${sql.join(
        photoValues.map(
          (p) => sql`(${p.recipeId}::bigint, ${p.url}::text, ${p.position}::smallint)`,
        ),
        sql`, `,
      )}) AS v(recipe_id, url, position)
    `);
  }

  /* ---- Social: comments/ratings, favorites, cook_status, subscription -- */
  console.log("Seeding social data ...");
  const carbonara = recipeIds[0]!;
  const tacos = recipeIds[1]!;
  const curry = recipeIds[2]!;

  await db.insert(comments).values([
    {
      recipeId: carbonara,
      userId: bob,
      rating: 5,
      body: "Perfect emulsion, no scrambled eggs. Restaurant quality.",
    },
    {
      recipeId: carbonara,
      userId: carol,
      rating: 4,
      body: "Great, though I cut the bacon for a veggie version.",
    },
    {
      recipeId: tacos,
      userId: alice,
      rating: 5,
      body: "Weeknight hero. Made it three times this month.",
    },
    {
      recipeId: curry,
      userId: bob,
      rating: 4,
      body: "Cozy and filling. Added a chopped chili for heat.",
    },
    {
      recipeId: curry,
      userId: alice,
      body: "Pure comment, no rating — thanks for sharing!",
    },
  ]);

  await db.insert(favorites).values([
    { userId: bob, recipeId: carbonara },
    { userId: carol, recipeId: curry },
    { userId: alice, recipeId: tacos },
    { userId: bob, recipeId: curry },
  ]);

  await db.insert(cookStatus).values([
    { userId: bob, recipeId: carbonara, status: "cooked" },
    { userId: bob, recipeId: curry, status: "cooked" },
    { userId: carol, recipeId: curry, status: "cooked" },
    { userId: alice, recipeId: tacos, status: "cooked" },
    { userId: carol, recipeId: carbonara, status: "want_to_cook" },
    { userId: alice, recipeId: curry, status: "want_to_cook" },
  ]);

  await db
    .insert(subscriptions)
    .values([{ subscriberId: bob, authorId: alice }]);

  await db.insert(notifications).values([
    {
      userId: alice,
      type: "new_comment",
      payload: { recipeId: carbonara, fromUserId: bob },
    },
  ]);

  /* ---- Summary --------------------------------------------------------- */
  const counts = await db.execute<{ table: string; n: number }>(sql`
    SELECT 'users' AS table, count(*)::int AS n FROM users
    UNION ALL SELECT 'recipes', count(*)::int FROM recipes
    UNION ALL SELECT 'ingredients', count(*)::int FROM ingredients
    UNION ALL SELECT 'recipe_ingredients', count(*)::int FROM recipe_ingredients
    UNION ALL SELECT 'comments', count(*)::int FROM comments
  `);
  console.log("Seed complete:");
  console.table(counts.rows);

  await pool.end();
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
