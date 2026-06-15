CREATE TYPE "public"."comment_status" AS ENUM('visible', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."complaint_target" AS ENUM('recipe', 'user', 'comment');--> statement-breakpoint
CREATE TYPE "public"."cook_status_kind" AS ENUM('cooked', 'want_to_cook');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('new_comment', 'new_rating', 'new_recipe_from_author');--> statement-breakpoint
CREATE TYPE "public"."recipe_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."recipe_status" AS ENUM('draft', 'pending', 'published', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('registered', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'blocked');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"recipe_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"rating" smallint,
	"body" text DEFAULT '' NOT NULL,
	"status" "comment_status" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "complaints" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"reporter_id" bigint NOT NULL,
	"target_type" "complaint_target" NOT NULL,
	"target_id" bigint NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" "complaint_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cook_status" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"recipe_id" bigint NOT NULL,
	"status" "cook_status_kind" NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cuisines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "favorites" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"recipe_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingredients" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"is_basic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"type" "notification_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "photos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"recipe_id" bigint NOT NULL,
	"url" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_categories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"recipe_id" bigint NOT NULL,
	"category_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_ingredients" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"recipe_id" bigint NOT NULL,
	"ingredient_id" bigint NOT NULL,
	"quantity" varchar(60),
	"unit" varchar(40),
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"recipe_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"author_id" bigint NOT NULL,
	"title" varchar(240) NOT NULL,
	"slug" varchar(280) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cuisine_id" bigint,
	"status" "recipe_status" DEFAULT 'draft' NOT NULL,
	"prep_time_min" integer,
	"cook_time_min" integer,
	"calories" integer,
	"difficulty" "recipe_difficulty",
	"servings" integer,
	"vegan" boolean DEFAULT false NOT NULL,
	"vegetarian" boolean DEFAULT false NOT NULL,
	"gluten_free" boolean DEFAULT false NOT NULL,
	"lactose_free" boolean DEFAULT false NOT NULL,
	"ingredient_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')) STORED,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "steps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"recipe_id" bigint NOT NULL,
	"position" smallint NOT NULL,
	"text" text NOT NULL,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"author_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_preferences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"vegan" boolean DEFAULT false NOT NULL,
	"vegetarian" boolean DEFAULT false NOT NULL,
	"gluten_free" boolean DEFAULT false NOT NULL,
	"lactose_free" boolean DEFAULT false NOT NULL,
	"allergies" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"disliked_ingredients" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"bio" text,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'registered' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "complaints" ADD CONSTRAINT "complaints_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cook_status" ADD CONSTRAINT "cook_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cook_status" ADD CONSTRAINT "cook_status_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "favorites" ADD CONSTRAINT "favorites_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photos" ADD CONSTRAINT "photos_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_categories" ADD CONSTRAINT "recipe_categories_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_categories" ADD CONSTRAINT "recipe_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_cuisine_id_cuisines_id_fk" FOREIGN KEY ("cuisine_id") REFERENCES "public"."cuisines"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "steps" ADD CONSTRAINT "steps_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subscriber_id_users_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_name_key" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_key" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_recipe_status_idx" ON "comments" USING btree ("recipe_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_user_idx" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "complaints_status_idx" ON "complaints" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "complaints_target_idx" ON "complaints" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cook_status_user_recipe_key" ON "cook_status" USING btree ("user_id","recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cook_status_user_status_idx" ON "cook_status" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cook_status_recipe_idx" ON "cook_status" USING btree ("recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cuisines_name_key" ON "cuisines" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cuisines_slug_key" ON "cuisines" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "favorites_user_recipe_key" ON "favorites" USING btree ("user_id","recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "favorites_recipe_idx" ON "favorites" USING btree ("recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ingredients_name_key" ON "ingredients" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ingredients_slug_key" ON "ingredients" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingredients_is_basic_idx" ON "ingredients" USING btree ("is_basic");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_recipe_idx" ON "photos" USING btree ("recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_categories_pair_key" ON "recipe_categories" USING btree ("recipe_id","category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_categories_category_idx" ON "recipe_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_ingredients_recipe_ingredient_key" ON "recipe_ingredients" USING btree ("recipe_id","ingredient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_ingredients_recipe_idx" ON "recipe_ingredients" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_ingredients_ingredient_idx" ON "recipe_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_tags_pair_key" ON "recipe_tags" USING btree ("recipe_id","tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_tags_tag_idx" ON "recipe_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipes_slug_key" ON "recipes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_author_idx" ON "recipes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_cuisine_idx" ON "recipes" USING btree ("cuisine_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_status_idx" ON "recipes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_prep_time_idx" ON "recipes" USING btree ("prep_time_min");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_cook_time_idx" ON "recipes" USING btree ("cook_time_min");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_calories_idx" ON "recipes" USING btree ("calories");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_difficulty_idx" ON "recipes" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_status_published_at_idx" ON "recipes" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "steps_recipe_position_key" ON "steps" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "steps_recipe_idx" ON "steps" USING btree ("recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_subscriber_author_key" ON "subscriptions" USING btree ("subscriber_id","author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_author_idx" ON "subscriptions" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tags_name_key" ON "tags" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tags_slug_key" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_preferences_user_key" ON "user_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
-- ============================================================================
-- Hand-written additions (not expressible in Drizzle 0.36 / drizzle-kit 0.28).
-- See spec/data-model.md "DB-level features". Safe to re-run (IF NOT EXISTS /
-- CREATE OR REPLACE).
-- ============================================================================

-- (1) Full-text search: GIN index on the generated tsvector column (§6.1).
CREATE INDEX IF NOT EXISTS "recipes_search_vector_gin" ON "recipes" USING gin ("search_vector");--> statement-breakpoint

-- (2) Smart selection: GIN index on the denormalized required-ingredient-id
--     array, so set-overlap (&&) / contains (@>) queries are index-backed (§6.2).
CREATE INDEX IF NOT EXISTS "recipes_ingredient_ids_gin" ON "recipes" USING gin ("ingredient_ids");--> statement-breakpoint

-- (3) Keep recipes.ingredient_ids in sync with recipe_ingredients. The array
--     holds only NON-BASIC ingredient ids (basics are always-available pantry
--     staples and are excluded from the "missing" calculation), so smart
--     selection can rank recipes purely from this array.
CREATE OR REPLACE FUNCTION refresh_recipe_ingredient_ids(p_recipe_id bigint)
RETURNS void AS $$
BEGIN
  UPDATE recipes r
  SET ingredient_ids = COALESCE((
    SELECT array_agg(ri.ingredient_id ORDER BY ri.ingredient_id)
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = p_recipe_id
      AND i.is_basic = false
  ), '{}'::bigint[])
  WHERE r.id = p_recipe_id;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION trg_recipe_ingredients_sync()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM refresh_recipe_ingredient_ids(OLD.recipe_id);
    RETURN OLD;
  ELSE
    PERFORM refresh_recipe_ingredient_ids(NEW.recipe_id);
    IF (TG_OP = 'UPDATE' AND NEW.recipe_id <> OLD.recipe_id) THEN
      PERFORM refresh_recipe_ingredient_ids(OLD.recipe_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS recipe_ingredients_sync ON recipe_ingredients;--> statement-breakpoint
CREATE TRIGGER recipe_ingredients_sync
AFTER INSERT OR UPDATE OR DELETE ON recipe_ingredients
FOR EACH ROW EXECUTE FUNCTION trg_recipe_ingredients_sync();--> statement-breakpoint

-- If an ingredient's is_basic flag flips, refresh every recipe that uses it so
-- the array reflects the new basic/non-basic classification.
CREATE OR REPLACE FUNCTION trg_ingredients_is_basic_sync()
RETURNS trigger AS $$
BEGIN
  IF (NEW.is_basic IS DISTINCT FROM OLD.is_basic) THEN
    PERFORM refresh_recipe_ingredient_ids(ri.recipe_id)
    FROM (SELECT DISTINCT recipe_id FROM recipe_ingredients WHERE ingredient_id = NEW.id) ri;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS ingredients_is_basic_sync ON ingredients;--> statement-breakpoint
CREATE TRIGGER ingredients_is_basic_sync
AFTER UPDATE OF is_basic ON ingredients
FOR EACH ROW EXECUTE FUNCTION trg_ingredients_is_basic_sync();--> statement-breakpoint

-- (4) Ratings are 1-5 when present (nullable for pure comments) (§5).
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_rating_range";--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_rating_range" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5));--> statement-breakpoint

-- (5) A complaint targets exactly one kind of entity; target_id must be > 0.
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_target_id_positive";--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_target_id_positive" CHECK ("target_id" > 0);--> statement-breakpoint

-- (6) A user cannot subscribe to themselves.
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_no_self";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_no_self" CHECK ("subscriber_id" <> "author_id");