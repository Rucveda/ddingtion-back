import bcrypt from "bcrypt";
import prisma from "../../db.js";
import {
  HC_BUYER_INGAME,
  HC_BUYER_LOGIN_ID,
  HC_DISCORD_BUYER,
  HC_DISCORD_SELLER,
  HC_SELLER_INGAME,
  HC_SELLER_LOGIN_ID,
} from "./constants.js";

const actorPassword = () =>
  process.env.SYSTEM_CHECK_ACTOR_PASSWORD?.trim() || "HcActor!local1";

const actorSpec = [
  {
    loginId: HC_SELLER_LOGIN_ID,
    ingameName: HC_SELLER_INGAME,
    discordId: HC_DISCORD_SELLER,
    role: "USER",
  },
  {
    loginId: HC_BUYER_LOGIN_ID,
    ingameName: HC_BUYER_INGAME,
    discordId: HC_DISCORD_BUYER,
    role: "USER",
  },
];

const ensureActor = async (spec) => {
  const passwordHash = await bcrypt.hash(actorPassword(), 10);
  const existing = await prisma.user.findFirst({
    where: { OR: [{ loginId: spec.loginId }, { ingameName: spec.ingameName }] },
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        loginId: spec.loginId,
        ingameName: spec.ingameName,
        passwordHash,
        role: spec.role,
        isBanned: false,
        discordId: spec.discordId,
      },
      select: { id: true, loginId: true, ingameName: true, role: true },
    });
  }

  return prisma.user.create({
    data: {
      loginId: spec.loginId,
      ingameName: spec.ingameName,
      passwordHash,
      role: spec.role,
      discordId: spec.discordId,
    },
    select: { id: true, loginId: true, ingameName: true, role: true },
  });
};

/** 헬스체크용 seller/buyer 계정을 보장합니다. */
export const ensureHealthCheckActors = async () => {
  const [seller, buyer] = await Promise.all(actorSpec.map((spec) => ensureActor(spec)));
  return { seller, buyer, password: actorPassword() };
};
