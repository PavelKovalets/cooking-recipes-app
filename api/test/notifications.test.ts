/**
 * NOTIFICATIONS coverage (objective.md, registered user):
 *   - "subscribe to recipe authors with notifications for new posts"
 *   - "receiving notifications about new comments and ratings on one's own
 *     recipes"
 *   - in-app feed: unread filter + mark one read + mark all read (api.md).
 */

import { describe, expect, it } from "vitest";

import {
  adminLogin,
  api,
  registerFreshUser,
  useApp,
} from "./helpers.js";

useApp();

async function publishViaAdmin(recipeId: number): Promise<void> {
  const { token } = await adminLogin();
  const res = await api.post(`/api/admin/recipes/${recipeId}/approve`, undefined, {
    token,
  });
  expect(res.status).toBe(200);
}

describe("Notification on new comment/rating on your own recipe (objective)", () => {
  it("commenting on someone's recipe writes a new_comment/new_rating notification to the author", async () => {
    const author = await registerFreshUser("notif-author");
    const create = await api.post(
      "/api/recipes",
      { title: "Notify On Comment" },
      { token: author.token },
    );
    const id = create.body.recipe.id;
    await publishViaAdmin(id);

    const commenter = await registerFreshUser("notif-commenter");
    const c = await api.post(
      `/api/recipes/${id}/comments`,
      { rating: 5, body: "Amazing!" },
      { token: commenter.token },
    );
    expect(c.status).toBe(201);

    const feed = await api.get("/api/me/notifications", { token: author.token });
    expect(feed.status).toBe(200);
    // rating present => type new_rating.
    const note = feed.body.items.find(
      (n: any) => n.type === "new_rating" && n.payload.recipeId === id,
    );
    expect(note).toBeDefined();
    expect(note.payload.fromUserId).toBe(commenter.user.id);
    expect(note.read).toBe(false);
    expect(feed.body.unreadCount).toBeGreaterThanOrEqual(1);
  });

  it("a pure comment (no rating) produces a new_comment notification", async () => {
    const author = await registerFreshUser("notif-author2");
    const create = await api.post(
      "/api/recipes",
      { title: "Notify On Pure Comment" },
      { token: author.token },
    );
    const id = create.body.recipe.id;
    await publishViaAdmin(id);

    const commenter = await registerFreshUser("notif-commenter2");
    await api.post(
      `/api/recipes/${id}/comments`,
      { body: "Just a note." },
      { token: commenter.token },
    );

    const feed = await api.get("/api/me/notifications", { token: author.token });
    const note = feed.body.items.find(
      (n: any) => n.type === "new_comment" && n.payload.recipeId === id,
    );
    expect(note).toBeDefined();
  });

  it("commenting on your OWN recipe does not notify yourself", async () => {
    const author = await registerFreshUser("selfnotif");
    const create = await api.post(
      "/api/recipes",
      { title: "Self Comment Recipe" },
      { token: author.token },
    );
    const id = create.body.recipe.id;
    await publishViaAdmin(id);

    const before = await api.get("/api/me/notifications", {
      token: author.token,
    });
    await api.post(
      `/api/recipes/${id}/comments`,
      { rating: 5 },
      { token: author.token },
    );
    const after = await api.get("/api/me/notifications", {
      token: author.token,
    });
    expect(after.body.items.length).toBe(before.body.items.length);
  });
});

describe("Notification on new recipe from a subscribed author (objective)", () => {
  it("subscriber gets a new_recipe_from_author when the author publishes", async () => {
    const author = await registerFreshUser("pub-author");
    const subscriber = await registerFreshUser("pub-subscriber");

    // Subscriber follows the author.
    await api.post(`/api/subscriptions/${author.user.id}`, undefined, {
      token: subscriber.token,
    });

    // Author creates a recipe (pending) ...
    const create = await api.post(
      "/api/recipes",
      { title: "Brand New Dish", slug: "brand-new-dish" },
      { token: author.token },
    );
    const id = create.body.recipe.id;
    // ... and the admin approval (first publish) fires subscriber notifications.
    await publishViaAdmin(id);

    const feed = await api.get("/api/me/notifications", {
      token: subscriber.token,
    });
    const note = feed.body.items.find(
      (n: any) =>
        n.type === "new_recipe_from_author" && n.payload.recipeId === id,
    );
    expect(note).toBeDefined();
    expect(note.payload.authorId).toBe(author.user.id);
    expect(note.payload.recipeTitle).toBe("Brand New Dish");
  });
});

describe("Notification feed: unread filter + mark read (api.md)", () => {
  it("?unread=true returns only unread; mark one read; read-all clears unread", async () => {
    const author = await registerFreshUser("feed-author");
    const create = await api.post(
      "/api/recipes",
      { title: "Feed Recipe" },
      { token: author.token },
    );
    const id = create.body.recipe.id;
    await publishViaAdmin(id);

    // Two commenters generate two notifications for the author.
    const c1 = await registerFreshUser("feed-c1");
    const c2 = await registerFreshUser("feed-c2");
    await api.post(`/api/recipes/${id}/comments`, { rating: 4 }, { token: c1.token });
    await api.post(`/api/recipes/${id}/comments`, { rating: 3 }, { token: c2.token });

    const unread = await api.get("/api/me/notifications", {
      token: author.token,
      query: { unread: "true" },
    });
    expect(unread.status).toBe(200);
    expect(unread.body.items.length).toBeGreaterThanOrEqual(2);
    expect(unread.body.items.every((n: any) => n.read === false)).toBe(true);

    // Mark the first one read.
    const firstId = unread.body.items[0].id;
    const markOne = await api.post(
      `/api/me/notifications/${firstId}/read`,
      undefined,
      { token: author.token },
    );
    expect(markOne.status).toBe(200);

    const afterOne = await api.get("/api/me/notifications", {
      token: author.token,
    });
    const marked = afterOne.body.items.find((n: any) => n.id === firstId);
    expect(marked.read).toBe(true);
    expect(marked.readAt).not.toBeNull();

    // Mark all read => unreadCount 0.
    const readAll = await api.post(
      "/api/me/notifications/read-all",
      undefined,
      { token: author.token },
    );
    expect(readAll.status).toBe(200);
    expect(readAll.body.updated).toBeGreaterThanOrEqual(1);

    const final = await api.get("/api/me/notifications", {
      token: author.token,
    });
    expect(final.body.unreadCount).toBe(0);
    expect(final.body.items.every((n: any) => n.read === true)).toBe(true);
  });

  it("a user cannot mark another user's notification read (404)", async () => {
    const a = await registerFreshUser("owner-notif");
    const b = await registerFreshUser("other-notif");
    const create = await api.post(
      "/api/recipes",
      { title: "Crossuser Recipe" },
      { token: a.token },
    );
    const id = create.body.recipe.id;
    await publishViaAdmin(id);
    const commenter = await registerFreshUser("crossuser-commenter");
    await api.post(`/api/recipes/${id}/comments`, { rating: 5 }, { token: commenter.token });
    const feed = await api.get("/api/me/notifications", { token: a.token });
    const noteId = feed.body.items[0].id;

    const res = await api.post(`/api/me/notifications/${noteId}/read`, undefined, {
      token: b.token,
    });
    expect(res.status).toBe(404);
  });

  it("notification feed requires auth (guest => 401)", async () => {
    const res = await api.get("/api/me/notifications");
    expect(res.status).toBe(401);
  });
});
