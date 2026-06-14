# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is a **greenfield project**. As of this writing the repository contains only `spec/objective.md`, `README.md`, and `LICENSE` — there is no application code, build system, dependencies, or tests yet. The technology stack (language, framework, database, test runner) has **not** been chosen. Selecting it is part of the work, and once chosen this file should be updated with the actual build / lint / test / run commands.

## How this project is meant to be built

This is a demonstration of building a web application end-to-end with Claude Code using **Spec Driven Development (SDD)**. Two rules govern the work:

1. **`spec/objective.md` is fixed.** It is the immutable problem statement. Do not edit it, narrow it, or contradict it. Treat it as the source of truth for *what* to build.
2. **All other decisions are Claude Code's to make** — stack, architecture, schema, UI, tooling, and how the work is decomposed across sub-agents.

SDD means deriving intermediate specs/plans from the objective *before* writing code, so implementation stays grounded in the requirements rather than improvised. When adding a feature, trace it back to a clause in `spec/objective.md`. References for the approach:
- https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering
- https://github.com/github/spec-kit

Keep `spec/` as the home for derived specifications and plans (alongside the fixed `objective.md`).

## What the application must do (big picture)

`spec/objective.md` is the authoritative requirements; read it in full before planning. In summary, it describes a **recipe-sharing web app** with three distinct actor roles whose permission boundaries drive the architecture:

- **Guest** — browse/search/filter the recipe catalog, view recipe details and reviews, register/log in.
- **Registered user** — everything a guest can do, plus authoring recipes, favorites, cooking history/status ("cooked" / "want to cook"), comments & ratings, profile preferences (allergies, diets), author subscriptions with notifications, personalized recommendations, and a **"smart selection"** feature (suggest recipes from a list of on-hand ingredients).
- **Administrator** — authentication-gated management of all entities (recipes, categories, tags, cuisines, ingredients, users), moderation queues (submission requests, reviews, complaints), user blocking, content hide/delete, and usage statistics.

Two features carry the most domain logic and deserve explicit design: **smart selection** (ingredient-based matching) and **personalized recommendations** (derived from a user's cooked/saved recipes and stated dietary preferences). The dietary/allergy model (vegan, vegetarian, gluten-free, lactose-free) cross-cuts search, filtering, smart selection, and recommendations — design it once and reuse it.
