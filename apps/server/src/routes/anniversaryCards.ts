import type { FastifyInstance } from "fastify";
import type { AnniversaryPhoto } from "@prisma/client";
import { anniversaryCardUpsertPayloadSchema, normalizeDottedDate } from "@map-of-us/shared";
import { requireAuth } from "../auth.js";
import { prisma } from "../prisma.js";
import { storeImage } from "../storage.js";
import type { AuthenticatedRequest } from "../types.js";

function serializeAnniversaryCard(card: {
  id: string;
  title: string;
  date: string;
  note: string;
  coverPhotoId: string | null;
  repeatYearly: boolean;
  pinned: boolean;
  sortOrder: number;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  photos: AnniversaryPhoto[];
}) {
  const sortedPhotos = [...card.photos].sort((a, b) => a.sortOrder - b.sortOrder);
  const cover = sortedPhotos.find((photo) => photo.id === card.coverPhotoId) ?? sortedPhotos[0];

  return {
    id: card.id,
    title: card.title,
    date: card.date,
    note: card.note,
    image: cover?.url,
    photos: sortedPhotos.map((photo) => photo.url),
    photoItems: sortedPhotos.map((photo) => ({
      id: photo.id,
      key: photo.key,
      url: photo.url,
      mimeType: photo.mimeType ?? undefined,
      sortOrder: photo.sortOrder,
    })),
    repeatYearly: card.repeatYearly,
    pinned: card.pinned,
    sortOrder: card.sortOrder,
    createdById: card.createdById ?? undefined,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

async function readCards(spaceId: string) {
  const cards = await prisma.anniversaryCard.findMany({
    where: { spaceId },
    include: { photos: true },
    orderBy: [{ pinned: "desc" }, { sortOrder: "asc" }, { date: "asc" }, { createdAt: "desc" }],
  });
  return cards.map(serializeAnniversaryCard);
}

export async function registerAnniversaryCardRoutes(app: FastifyInstance) {
  app.get("/anniversary-cards", { preHandler: requireAuth }, async (request) => {
    const auth = (request as AuthenticatedRequest).auth;
    return { cards: await readCards(auth.spaceId) };
  });

  app.post("/anniversary-cards", { preHandler: requireAuth }, async (request, reply) => {
    const auth = (request as AuthenticatedRequest).auth;
    const parsed = anniversaryCardUpsertPayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid anniversary card payload" });

    const normalizedDate = normalizeDottedDate(parsed.data.card.date);
    if (!normalizedDate) return reply.code(400).send({ error: "Invalid anniversary date" });

    const rawPhotos = parsed.data.card.photos?.length
      ? parsed.data.card.photos
      : parsed.data.card.image
        ? [parsed.data.card.image]
        : [];

    const card = await prisma.anniversaryCard.create({
      data: {
        spaceId: auth.spaceId,
        createdById: auth.userId,
        title: parsed.data.card.title.trim(),
        date: normalizedDate,
        note: parsed.data.card.note?.trim() ?? "",
        repeatYearly: parsed.data.card.repeatYearly ?? true,
        pinned: parsed.data.card.pinned ?? false,
        sortOrder: parsed.data.card.sortOrder ?? 0,
      },
    });

    const createdPhotos = await Promise.all(
      rawPhotos.map(async (photo, index) => {
        const stored = await storeImage(auth.spaceId, `anniversaries/${card.id}`, photo);
        return prisma.anniversaryPhoto.create({
          data: {
            anniversaryCardId: card.id,
            key: stored.key,
            url: stored.url,
            mimeType: stored.mimeType,
            sortOrder: index,
          },
        });
      }),
    );

    if (createdPhotos[0]) {
      await prisma.anniversaryCard.update({
        where: { id: card.id },
        data: { coverPhotoId: createdPhotos[0].id },
      });
    }

    return { card: (await readCards(auth.spaceId)).find((item) => item.id === card.id), cards: await readCards(auth.spaceId) };
  });

  app.patch("/anniversary-cards/:id", { preHandler: requireAuth }, async (request, reply) => {
    const auth = (request as AuthenticatedRequest).auth;
    const { id } = request.params as { id: string };
    const existing = await prisma.anniversaryCard.findFirst({ where: { id, spaceId: auth.spaceId }, include: { photos: true } });
    if (!existing) return reply.code(404).send({ error: "Anniversary card not found" });

    const parsed = anniversaryCardUpsertPayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid anniversary card payload" });
    const normalizedDate = normalizeDottedDate(parsed.data.card.date);
    if (!normalizedDate) return reply.code(400).send({ error: "Invalid anniversary date" });

    await prisma.anniversaryCard.update({
      where: { id: existing.id },
      data: {
        title: parsed.data.card.title.trim(),
        date: normalizedDate,
        note: parsed.data.card.note?.trim() ?? "",
        repeatYearly: parsed.data.card.repeatYearly ?? true,
        pinned: parsed.data.card.pinned ?? false,
        sortOrder: parsed.data.card.sortOrder ?? 0,
      },
    });

    if (parsed.data.card.photos?.length) {
      await prisma.anniversaryPhoto.deleteMany({ where: { anniversaryCardId: existing.id } });
      const createdPhotos = await Promise.all(
        parsed.data.card.photos.map(async (photo, index) => {
          const stored = await storeImage(auth.spaceId, `anniversaries/${existing.id}`, photo);
          return prisma.anniversaryPhoto.create({
            data: {
              anniversaryCardId: existing.id,
              key: stored.key,
              url: stored.url,
              mimeType: stored.mimeType,
              sortOrder: index,
            },
          });
        }),
      );
      await prisma.anniversaryCard.update({
        where: { id: existing.id },
        data: { coverPhotoId: createdPhotos[0]?.id ?? null },
      });
    }

    return { card: (await readCards(auth.spaceId)).find((item) => item.id === existing.id), cards: await readCards(auth.spaceId) };
  });

  app.delete("/anniversary-cards/:id", { preHandler: requireAuth }, async (request) => {
    const auth = (request as AuthenticatedRequest).auth;
    const { id } = request.params as { id: string };
    await prisma.anniversaryCard.deleteMany({ where: { id, spaceId: auth.spaceId } });
    return { ok: true, cards: await readCards(auth.spaceId) };
  });
}
