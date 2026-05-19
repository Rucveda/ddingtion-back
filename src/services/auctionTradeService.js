import prisma from "../db.js";

export class AuctionServiceError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "AuctionServiceError";
    this.status = status;
  }
}

export const createAuctionListing = async ({ userId, body, redisConnection, auctionQueue, clientIp }) => {
  await redisConnection.set(`user_ip:${userId}`, clientIp, "EX", 86400);

  const { itemId, startPrice, buyNowPrice, durationDays, durationHours, enhancementLevel, enhancementRank, enchantments, imprints, skills, runes, description } = body;

  const parsedStartPrice = BigInt(startPrice);
  if (parsedStartPrice <= 0n) {
    throw new AuctionServiceError("시작가는 0보다 커야 합니다.", 400);
  }
  if (buyNowPrice && BigInt(buyNowPrice) <= parsedStartPrice) {
    throw new AuctionServiceError("즉시 구매가는 시작가보다 높아야 합니다.", 400);
  }

  const parsedDurationDays = durationDays !== undefined
    ? parseInt(durationDays)
    : Math.ceil((parseInt(durationHours) || 24) / 24);
  if (!Number.isInteger(parsedDurationDays) || parsedDurationDays <= 0 || parsedDurationDays > 7) {
    throw new AuctionServiceError("경매 기간은 1~7일 사이여야 합니다.", 400);
  }

  const endTime = new Date();
  endTime.setDate(endTime.getDate() + parsedDurationDays);

  const newAuction = await prisma.auction.create({
    data: {
      sellerId: userId,
      itemId: parseInt(itemId),
      startPrice: parsedStartPrice,
      currentPrice: parsedStartPrice,
      buyNowPrice: buyNowPrice ? BigInt(buyNowPrice) : null,
      endTime,
      status: "ACTIVE",
      description: description ? String(description).slice(0, 500) : null,
      enhancementLevel: parseInt(enhancementLevel) || 0,
      enhancementRank,
      enchantments,
      imprint: imprints,
      skills,
      runes,
    },
  });

  await auctionQueue.add(
    "endAuction",
    { auctionId: newAuction.id },
    {
      delay: parsedDurationDays * 24 * 3600000,
      jobId: `auction_${newAuction.id}`,
    },
  );

  return newAuction;
};

export const relistAuction = async ({ auctionId, userId, body, redisConnection, auctionQueue, clientIp }) => {
  const sourceAuction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      bids: { select: { id: true }, take: 1 },
    },
  });

  if (!sourceAuction) {
    throw new AuctionServiceError("재등록할 경매를 찾을 수 없습니다.", 404);
  }
  if (sourceAuction.sellerId !== userId) {
    throw new AuctionServiceError("본인이 등록한 경매만 다시 등록할 수 있습니다.", 403);
  }
  if (!["EXPIRED", "CANCELED"].includes(sourceAuction.status)) {
    throw new AuctionServiceError("만료되었거나 유찰된 경매만 다시 등록할 수 있습니다.", 400);
  }
  if (sourceAuction.bids.length > 0) {
    throw new AuctionServiceError("입찰 기록이 있는 경매는 다시 등록할 수 없습니다.", 400);
  }

  return createAuctionListing({
    userId,
    redisConnection,
    auctionQueue,
    clientIp,
    body: {
      itemId: sourceAuction.itemId,
      startPrice: sourceAuction.startPrice.toString(),
      buyNowPrice: sourceAuction.buyNowPrice?.toString() || null,
      durationDays: "1",
      enhancementLevel: sourceAuction.enhancementLevel,
      enhancementRank: sourceAuction.enhancementRank,
      enchantments: sourceAuction.enchantments,
      imprints: sourceAuction.imprint,
      skills: sourceAuction.skills,
      runes: sourceAuction.runes,
      description: sourceAuction.description,
      ...body,
    },
  });
};

export const buyNowAuction = async ({ auctionId, user, redisConnection, auctionQueue, clientIp }) => {
  await redisConnection.set(`user_ip:${user.id}`, clientIp, "EX", 86400);

  const { room, finalPrice } = await prisma.$transaction(async (tx) => {
    const auctions = await tx.$queryRaw`SELECT * FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
    const auction = auctions[0];

    if (!auction || auction.status !== "ACTIVE") {
      throw new AuctionServiceError("이미 판매 완료되었거나 무효한 경매입니다.", 400);
    }

    if (!auction.buyNowPrice) {
      throw new AuctionServiceError("즉시 구매가 불가능한 경매입니다.", 400);
    }
    if (auction.sellerId === user.id) {
      throw new AuctionServiceError("본인이 등록한 물품은 구매할 수 없습니다.", 400);
    }

    await tx.auction.update({ where: { id: auctionId }, data: { status: "PENDING_TRADE", currentPrice: auction.buyNowPrice } });
    await tx.bid.create({ data: { auctionId, bidderId: user.id, bidAmount: auction.buyNowPrice } });

    const newRoom = await tx.chatRoom.create({ data: { auctionId, sellerId: auction.sellerId, buyerId: user.id, isAdminChat: false } });

    await tx.notification.create({
      data: {
        userId: auction.sellerId,
        type: "TRADE",
        message: "전리품 거래가 즉시 성사되었습니다. 구매자와 거래를 확정해주세요.",
        link: `/auction/${auctionId}`,
      },
    });

    return { room: newRoom, finalPrice: auction.buyNowPrice };
  });

  try {
    const job = await auctionQueue.getJob(`auction_${auctionId}`);
    if (job) {
      await job.remove();
      console.log(`[경매 ${auctionId}] 불필요한 마감 예약 큐가 정상적으로 제거되었습니다.`);
    }
  } catch (jobErr) {
    console.error("BullMQ 큐 제거 중 예외 (무시됨):", jobErr);
  }

  const eventPayload = {
    auctionId,
    winner: user.ingameName,
    price: finalPrice.toString(),
    reason: "BUY_NOW",
  };
  await redisConnection.publish("auction-events", JSON.stringify(eventPayload));

  return { roomId: room.id };
};
