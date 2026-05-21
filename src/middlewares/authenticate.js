import jwt from "jsonwebtoken";
import prisma from "../db.js";
import { env } from "../config/env.js";

const JWT_SECRET = env.JWT_SECRET;

const authenticate = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "로그인이 필요한 서비스입니다." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const targetId = decoded.id || decoded.userId;

    if (!targetId) {
      console.error("❌ 토큰 내 유저 식별 정보가 없습니다:", decoded);
      return res.status(403).json({ error: "유효하지 않은 인증 토큰입니다." });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(targetId, 10) },
      select: {
        id: true,
        role: true,
        ingameName: true,
        discordId: true,
        isBanned: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "존재하지 않는 계정 정보입니다. 다시 로그인해주세요." });
    }

    if (user.isBanned) {
      return res.status(403).json({
        code: "ACCOUNT_BANNED",
        error: "관리자에 의해 차단된 계정입니다.",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);
    if (err.name === "TokenExpiredError") {
      return res.status(403).json({ error: "세션이 만료되었습니다. 다시 로그인해주세요." });
    }
    return res.status(403).json({ error: "유효하지 않은 인증 세션입니다." });
  }
};

export default authenticate;
