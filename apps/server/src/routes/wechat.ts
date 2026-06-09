import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth.js";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types.js";

type WechatSessionResponse = {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
};

async function exchangeWechatCode(code: string) {
  if (!config.WECHAT_MINI_APP_ID || !config.WECHAT_MINI_APP_SECRET) {
    return { configured: false as const };
  }

  const params = new URLSearchParams({
    appid: config.WECHAT_MINI_APP_ID,
    secret: config.WECHAT_MINI_APP_SECRET,
    js_code: code,
    grant_type: "authorization_code",
  });
  const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`);
  const data = (await response.json().catch(() => null)) as WechatSessionResponse | null;
  if (!response.ok || !data?.openid || data.errcode) {
    throw new Error(data?.errmsg || "Wechat session exchange failed");
  }

  return { configured: true as const, openid: data.openid };
}

function makeAuthPayload(userId: string, spaceId: string, role: "owner" | "member") {
  return { userId, spaceId, role };
}

export async function registerWechatRoutes(app: FastifyInstance) {
  app.post("/auth/wechat/session", async (request, reply) => {
    const body = request.body as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) return reply.code(400).send({ error: "Wechat code is required" });

    const exchanged = await exchangeWechatCode(code).catch((error: Error) => ({ error: error.message }));
    if ("error" in exchanged) return reply.code(502).send({ error: exchanged.error });
    if (!exchanged.configured) return { configured: false, bound: false };

    const user = await prisma.user.findUnique({
      where: { wechatOpenId: exchanged.openid },
      include: {
        memberships: {
          include: { space: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const membership = user?.memberships[0];
    if (!user || !membership) return { configured: true, bound: false };

    const authPayload = makeAuthPayload(user.id, membership.spaceId, membership.role);
    const accessToken = app.jwt.sign({ ...authPayload, type: "access" }, { expiresIn: "30m" });
    const refreshToken = app.jwt.sign({ ...authPayload, type: "refresh" }, { expiresIn: "30d" });

    return {
      configured: true,
      bound: true,
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, displayName: user.displayName },
      space: {
        id: membership.space.id,
        name: membership.space.name,
        slug: membership.space.slug,
        plan: membership.space.plan,
        status: membership.space.status,
        trialEndsAt: membership.space.trialEndsAt?.toISOString(),
      },
      membership: { role: membership.role },
    };
  });

  app.post("/auth/wechat/bind", { preHandler: requireAuth }, async (request, reply) => {
    const auth = (request as AuthenticatedRequest).auth;
    const body = request.body as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) return reply.code(400).send({ error: "Wechat code is required" });

    const exchanged = await exchangeWechatCode(code).catch((error: Error) => ({ error: error.message }));
    if ("error" in exchanged) return reply.code(502).send({ error: exchanged.error });
    if (!exchanged.configured) return reply.code(503).send({ error: "Wechat mini program is not configured" });

    await prisma.user.update({
      where: { id: auth.userId },
      data: { wechatOpenId: exchanged.openid },
    });

    return { ok: true };
  });
}
