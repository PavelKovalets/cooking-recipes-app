/**
 * Notification routes (registered): in-app feed + mark-read.
 */

import type { FastifyInstance } from "fastify";

import { authGuard, requireAuth } from "../../platform/authz.js";
import {
  listNotifications,
  markAllRead,
  markRead,
} from "./notification.service.js";

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/me/notifications",
    { preHandler: authGuard },
    async (request) => {
      const p = requireAuth(request);
      const q = request.query as { unread?: string };
      const unreadOnly = q.unread === "true" || q.unread === "1";
      return listNotifications(p.id, { unreadOnly });
    },
  );

  app.post(
    "/me/notifications/:id/read",
    { preHandler: authGuard },
    async (request) => {
      const p = requireAuth(request);
      const { id } = request.params as { id: string };
      await markRead(p.id, Number(id));
      return { ok: true };
    },
  );

  app.post(
    "/me/notifications/read-all",
    { preHandler: authGuard },
    async (request) => {
      const p = requireAuth(request);
      const updated = await markAllRead(p.id);
      return { ok: true, updated };
    },
  );
}
