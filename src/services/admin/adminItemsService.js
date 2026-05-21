import prisma from "../../db.js";
import { AdminServiceError } from "./adminErrors.js";
import { removeItemImageByUrl, uploadItemImage } from "../../lib/admin/supabaseStorage.js";

export const listItems = () => prisma.item.findMany({ orderBy: { id: "desc" } });

export const createItem = async ({ name, category, file }) => {
  if (!name || !category) {
    throw new AdminServiceError("이름과 카테고리는 필수입니다.", 400);
  }
  if (!file) {
    throw new AdminServiceError("이미지 파일이 누락되었습니다.", 400);
  }

  const existingItem = await prisma.item.findUnique({ where: { name } });
  if (existingItem) {
    throw new AdminServiceError("이미 존재하는 아이템 이름입니다.", 400);
  }

  const iconUrl = await uploadItemImage(file);
  return prisma.item.create({ data: { name, category, iconUrl } });
};

export const deleteItem = async (itemId) => {
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) {
    throw new AdminServiceError("아이템 없음", 404);
  }

  await prisma.$transaction(async (tx) => {
    const auctions = await tx.auction.findMany({ where: { itemId } });
    const auctionIds = auctions.map((a) => a.id);
    if (auctionIds.length > 0) {
      await tx.bid.deleteMany({ where: { auctionId: { in: auctionIds } } });
      await tx.chatRoom.deleteMany({ where: { auctionId: { in: auctionIds } } });
      await tx.review.deleteMany({ where: { auctionId: { in: auctionIds } } });
    }
    await tx.auction.deleteMany({ where: { itemId } });
    await tx.marketHistory.deleteMany({ where: { itemId } });
    await tx.item.delete({ where: { id: itemId } });
  });

  await removeItemImageByUrl(item.iconUrl);
};
