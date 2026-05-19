import prisma from "../db.js";
import { assertIpNotStrictBanned, getClientIp } from "../lib/strictIpBan.js";

export const attachClientIp = (req, res, next) => {
  req.clientIp = getClientIp(req);
  next();
};

export const rejectStrictBannedIp = async (req, res, next) => {
  try {
    await assertIpNotStrictBanned(req.clientIp || getClientIp(req));
    next();
  } catch (error) {
    return res.status(error.status || 403).json({
      code: error.code || "IP_STRICT_BANNED",
      error: error.message,
    });
  }
};

export const rejectBannedAccount = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.user.id, 10) },
      select: { isBanned: true },
    });
    if (!user) {
      return res.status(401).json({ error: "존재하지 않는 계정입니다." });
    }
    if (user.isBanned) {
      return res.status(403).json({
        code: "ACCOUNT_BANNED",
        error: "관리자에 의해 차단된 계정입니다.",
      });
    }
    next();
  } catch {
    return res.status(500).json({ error: "계정 확인 실패" });
  }
};
