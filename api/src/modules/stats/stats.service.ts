/**
 * Admin statistics (architecture §7, computed on-demand per §1.1).
 * Recipe count, user activity, popular categories, plus moderation counters.
 */

import { sql } from "drizzle-orm";

import { db } from "../../db/index.js";

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
    authors: number; // users who have authored >= 1 recipe
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
  popularCategories: Array<{
    categoryId: number;
    name: string;
    recipeCount: number;
  }>;
  topRatedRecipes: Array<{
    recipeId: number;
    title: string;
    averageRating: number;
    ratingCount: number;
  }>;
  mostActiveUsers: Array<{
    userId: number;
    displayName: string;
    recipeCount: number;
    commentCount: number;
  }>;
}

export async function getAdminStats(): Promise<AdminStats> {
  const recipeCounts = await db.execute<{
    total: string;
    published: string;
    pending: string;
    hidden: string;
    draft: string;
  }>(sql`
    select
      count(*)::int as total,
      count(*) filter (where status = 'published')::int as published,
      count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'hidden')::int as hidden,
      count(*) filter (where status = 'draft')::int as draft
    from recipes
  `);

  const userCounts = await db.execute<{
    total: string;
    active: string;
    blocked: string;
    admins: string;
    authors: string;
  }>(sql`
    select
      count(*)::int as total,
      count(*) filter (where status = 'active')::int as active,
      count(*) filter (where status = 'blocked')::int as blocked,
      count(*) filter (where role = 'admin')::int as admins,
      (select count(distinct author_id)::int from recipes) as authors
    from users
  `);

  const engagement = await db.execute<{
    comments: string;
    ratings: string;
    favorites: string;
    cooked: string;
    subscriptions: string;
  }>(sql`
    select
      (select count(*)::int from comments where status = 'visible') as comments,
      (select count(*)::int from comments where status = 'visible' and rating is not null) as ratings,
      (select count(*)::int from favorites) as favorites,
      (select count(*)::int from cook_status where status = 'cooked') as cooked,
      (select count(*)::int from subscriptions) as subscriptions
  `);

  const moderation = await db.execute<{
    open_complaints: string;
    pending_recipes: string;
    hidden_comments: string;
  }>(sql`
    select
      (select count(*)::int from complaints where status = 'open') as open_complaints,
      (select count(*)::int from recipes where status = 'pending') as pending_recipes,
      (select count(*)::int from comments where status = 'hidden') as hidden_comments
  `);

  const popularCategories = await db.execute<{
    category_id: string;
    name: string;
    recipe_count: string;
  }>(sql`
    select c.id as category_id, c.name,
           count(rc.recipe_id)::int as recipe_count
    from categories c
    left join recipe_categories rc on rc.category_id = c.id
    left join recipes r on r.id = rc.recipe_id and r.status = 'published'
    group by c.id, c.name
    order by recipe_count desc, c.name asc
    limit 10
  `);

  const topRated = await db.execute<{
    recipe_id: string;
    title: string;
    avg_rating: string;
    rating_count: string;
  }>(sql`
    select r.id as recipe_id, r.title,
           round(avg(c.rating)::numeric, 2) as avg_rating,
           count(c.rating)::int as rating_count
    from recipes r
    join comments c on c.recipe_id = r.id and c.status = 'visible' and c.rating is not null
    where r.status = 'published'
    group by r.id, r.title
    order by avg_rating desc, rating_count desc
    limit 10
  `);

  const mostActive = await db.execute<{
    user_id: string;
    display_name: string;
    recipe_count: string;
    comment_count: string;
  }>(sql`
    select u.id as user_id, u.display_name,
      (select count(*)::int from recipes r where r.author_id = u.id) as recipe_count,
      (select count(*)::int from comments c where c.user_id = u.id) as comment_count
    from users u
    order by (
      (select count(*) from recipes r where r.author_id = u.id) +
      (select count(*) from comments c where c.user_id = u.id)
    ) desc
    limit 10
  `);

  const rc = recipeCounts.rows[0]!;
  const uc = userCounts.rows[0]!;
  const eg = engagement.rows[0]!;
  const mod = moderation.rows[0]!;

  return {
    recipes: {
      total: Number(rc.total),
      published: Number(rc.published),
      pending: Number(rc.pending),
      hidden: Number(rc.hidden),
      draft: Number(rc.draft),
    },
    users: {
      total: Number(uc.total),
      active: Number(uc.active),
      blocked: Number(uc.blocked),
      admins: Number(uc.admins),
      authors: Number(uc.authors),
    },
    engagement: {
      comments: Number(eg.comments),
      ratings: Number(eg.ratings),
      favorites: Number(eg.favorites),
      cookedMarks: Number(eg.cooked),
      subscriptions: Number(eg.subscriptions),
    },
    moderation: {
      openComplaints: Number(mod.open_complaints),
      pendingRecipes: Number(mod.pending_recipes),
      hiddenComments: Number(mod.hidden_comments),
    },
    popularCategories: popularCategories.rows.map((r) => ({
      categoryId: Number(r.category_id),
      name: r.name,
      recipeCount: Number(r.recipe_count),
    })),
    topRatedRecipes: topRated.rows.map((r) => ({
      recipeId: Number(r.recipe_id),
      title: r.title,
      averageRating: Number(r.avg_rating),
      ratingCount: Number(r.rating_count),
    })),
    mostActiveUsers: mostActive.rows.map((r) => ({
      userId: Number(r.user_id),
      displayName: r.display_name,
      recipeCount: Number(r.recipe_count),
      commentCount: Number(r.comment_count),
    })),
  };
}
