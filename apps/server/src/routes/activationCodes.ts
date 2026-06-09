import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { activationCodeClaimPayloadSchema } from "@map-of-us/shared";
import { hashPassword, requireAuth, requireOwner, scopedUsername } from "../auth.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types.js";

const activationCodePrefix = "OMR";

function activationCodeDigest(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function makeActivationCode() {
  return `${activationCodePrefix}-${nanoid(6).toUpperCase()}-${nanoid(6).toUpperCase()}`;
}

function makeSpaceSlug() {
  return `couple-${nanoid(8).toLowerCase()}`;
}

function publicActivationCode(row: {
  id: string;
  status: string;
  plan: string;
  expiresAt: Date | null;
  usedAt: Date | null;
  usedBySpaceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    status: row.status,
    plan: row.plan,
    expiresAt: row.expiresAt?.toISOString(),
    usedAt: row.usedAt?.toISOString(),
    usedBySpaceId: row.usedBySpaceId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function registerActivationCodeRoutes(app: FastifyInstance) {
  app.get("/activation-codes", { preHandler: [requireAuth, requireOwner] }, async () => {
    const rows = await prisma.activationCode.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return { activationCodes: rows.map(publicActivationCode) };
  });

  app.post("/activation-codes", { preHandler: [requireAuth, requireOwner] }, async (request) => {
    const auth = (request as AuthenticatedRequest).auth;
    const body = request.body as { expiresAt?: unknown; plan?: unknown } | null;
    const code = makeActivationCode();
    const expiresAt =
      typeof body?.expiresAt === "string" && body.expiresAt
        ? new Date(body.expiresAt)
        : null;
    const row = await prisma.activationCode.create({
      data: {
        codeHash: activationCodeDigest(code),
        createdById: auth.userId,
        plan: body?.plan === "pro" || body?.plan === "team" ? body.plan : "private",
        expiresAt: expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : null,
      },
    });
    return { activationCode: { ...publicActivationCode(row), code } };
  });

  app.post("/activation-codes/claim", async (request, reply) => {
    const parsed = activationCodeClaimPayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid activation payload" });

    const codeHash = activationCodeDigest(parsed.data.code);
    const activationCode = await prisma.activationCode.findUnique({ where: { codeHash } });
    if (!activationCode || activationCode.status !== "active") {
      return reply.code(400).send({ error: "Activation code is invalid" });
    }
    if (activationCode.expiresAt && activationCode.expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({ error: "Activation code has expired" });
    }

    const slug = makeSpaceSlug();
    const [first, second] = parsed.data.accounts.map((account) => ({
      username: account.username.trim(),
      displayName: account.displayName?.trim() || account.username.trim(),
      password: account.password,
    }));

    const result = await prisma.$transaction(async (tx) => {
      const space = await tx.space.create({
        data: {
          name: parsed.data.spaceName.trim(),
          slug,
          plan: activationCode.plan,
          status: "active",
        },
      });

      const users = await Promise.all(
        [
          { ...first, role: "owner" as const },
          { ...second, role: "member" as const },
        ].map(async (account) => {
          const user = await tx.user.create({
            data: {
              username: scopedUsername(space.slug, account.username),
              displayName: account.displayName,
              passwordHash: await hashPassword(account.password),
            },
          });
          await tx.membership.create({
            data: {
              userId: user.id,
              spaceId: space.id,
              role: account.role,
            },
          });
          return { id: user.id, username: account.username, displayName: user.displayName, role: account.role };
        }),
      );

      await tx.activationCode.update({
        where: { id: activationCode.id },
        data: {
          status: "used",
          usedAt: new Date(),
          usedBySpaceId: space.id,
        },
      });

      return {
        space: {
          id: space.id,
          name: space.name,
          slug: space.slug,
          plan: space.plan,
          status: space.status,
        },
        accounts: users,
      };
    });

    return { ok: true, ...result };
  });
}
