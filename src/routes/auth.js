import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import authenticateToken from '../middlewares/authMiddleware.js';
import { env, getDiscordConfigStatus, isDiscordVerificationEnforced } from '../config/env.js';
import {
  buildDiscordAuthorizeUrl,
  exchangeDiscordCode,
  fetchDiscordCurrentUser,
  fetchAllDiscordGuilds,
  assertUserInRequiredGuild,
} from '../services/discordLinkService.js';

const router = express.Router();
const JWT_SECRET = env.JWT_SECRET;

const frontendBase = () => env.FRONTEND_URL.replace(/\/$/, "");

/**
 * [GET] /api/auth/me
 * 💡 마이페이지 실시간 데이터 동기화
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "유효하지 않은 유저 식별자입니다." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        loginId: true,
        ingameName: true,
        role: true,
        isBanned: true,
        reputationScore: true,
        reviewCount: true,
        successfulTrades: true,
        createdAt: true,
        discordId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    if (user.isBanned) {
      return res.status(403).json({
        code: "ACCOUNT_BANNED",
        error: "관리자에 의해 차단된 계정입니다.",
      });
    }

    const { discordId, ...rest } = user;
    res.json({
      ...rest,
      discordLinked: Boolean(discordId),
      discordVerificationRequired: isDiscordVerificationEnforced(),
      discordConfig: getDiscordConfigStatus(),
    });
  } catch (error) {
    console.error("내 정보 조회 오류:", error);
    res.status(500).json({ error: "계정 정보를 불러오지 못했습니다." });
  }
});

/**
 * [GET] /api/auth/discord/authorize
 * 로그인한 사용자만 디스코드 OAuth 시작 URL을 받습니다.
 */
router.get('/discord/authorize', authenticateToken, async (req, res) => {
  try {
    if (!isDiscordVerificationEnforced()) {
      return res.status(503).json({
        error:
          "디스코드 인증이 서버에서 설정되지 않았습니다. 관리자에게 문의하세요.",
      });
    }
    if (req.user.discordId) {
      return res.status(400).json({ error: "이미 디스코드 계정이 연동되어 있습니다." });
    }

    const state = jwt.sign(
      { purpose: "discord_oauth", uid: req.user.id },
      JWT_SECRET,
      { expiresIn: "10m" },
    );
    const url = buildDiscordAuthorizeUrl(state);
    res.json({ url });
  } catch (error) {
    console.error("Discord authorize:", error);
    res.status(500).json({ error: error.message || "인증 URL 생성 실패" });
  }
});

/**
 * [GET] /api/auth/discord/callback
 * Discord OAuth 리다이렉트 (공개)
 */
router.get('/discord/callback', async (req, res) => {
  const fail = (reason) =>
    res.redirect(
      `${frontendBase()}/mypage?discord=error&reason=${encodeURIComponent(reason)}`,
    );
  const ok = () => res.redirect(`${frontendBase()}/mypage?discord=linked`);

  try {
    const { code, state } = req.query;
    if (!code || !state || typeof code !== "string" || typeof state !== "string") {
      return fail("missing_params");
    }

    let payload;
    try {
      payload = jwt.verify(state, JWT_SECRET);
    } catch {
      return fail("invalid_state");
    }
    if (payload.purpose !== "discord_oauth" || !payload.uid) {
      return fail("invalid_state");
    }

    const userId = parseInt(payload.uid, 10);
    if (isNaN(userId)) return fail("invalid_state");

    const appUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!appUser || appUser.isBanned) {
      return fail("forbidden");
    }
    if (appUser.discordId) {
      return ok();
    }

    const tokenResponse = await exchangeDiscordCode(code);
    const accessToken = tokenResponse.access_token;
    const discordUser = await fetchDiscordCurrentUser(accessToken);
    if (!discordUser.id) return fail("no_discord_user");

    if (env.DISCORD_REQUIRED_GUILD_ID) {
      const guilds = await fetchAllDiscordGuilds(accessToken);
      try {
        assertUserInRequiredGuild(guilds, env.DISCORD_REQUIRED_GUILD_ID);
      } catch (e) {
        if (e.message === "REQUIRED_GUILD_MISSING") return fail("guild");
        throw e;
      }
    }

    const discordId = String(discordUser.id);
    const holder = await prisma.user.findUnique({ where: { discordId } });
    if (holder && holder.id !== userId) {
      return fail("in_use");
    }

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { discordId },
      });
    } catch (e) {
      if (e.code === "P2002") return fail("in_use");
      throw e;
    }

    return ok();
  } catch (error) {
    console.error("Discord callback:", error);
    return fail("server");
  }
});

/**
 * [POST] /api/auth/register
 * 회원가입
 */
router.post('/register', async (req, res) => {
  try {
    let { loginId, password, ingameName } = req.body;
    
    if (!loginId || !password || !ingameName) {
      return res.status(400).json({ error: "모든 필드를 입력해주세요." });
    }

    loginId = loginId.trim();
    ingameName = ingameName.trim();

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ loginId }, { ingameName }] }
    });
    
    if (existingUser) {
      const field = existingUser.loginId === loginId ? "아이디" : "닉네임";
      return res.status(409).json({ error: `이미 존재하는 ${field}입니다.` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { 
        loginId, 
        passwordHash: hashedPassword, 
        ingameName, 
        role: "USER",
        reputationScore: 5.0,
        reviewCount: 0
      } 
    });

    res.status(201).json({ 
      message: "회원가입 완료", 
      user: { 
        id: newUser.id, 
        loginId: newUser.loginId, 
        ingameName: newUser.ingameName,
        role: newUser.role,
        discordLinked: false,
        discordVerificationRequired: isDiscordVerificationEnforced(),
        discordConfig: getDiscordConfigStatus(),
      } 
    });
  } catch (error) {
    console.error("회원가입 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

/**
 * [POST] /api/auth/login
 * 로그인
 */
router.post('/login', async (req, res) => {
  try {
    let { loginId, password } = req.body;
    if (!loginId || !password) return res.status(400).json({ error: "정보를 입력해주세요." });

    loginId = loginId.trim();

    const user = await prisma.user.findUnique({
      where: { loginId },
      select: {
        id: true,
        loginId: true,
        ingameName: true,
        role: true,
        passwordHash: true,
        isBanned: true,
        reputationScore: true,
        reviewCount: true,
        discordId: true,
      },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "아이디 또는 비밀번호가 잘못되었습니다." });
    }

    if (user.isBanned) {
      return res.status(403).json({
        code: "ACCOUNT_BANNED",
        error: "관리자에 의해 차단된 계정입니다. 접속할 수 없습니다.",
      });
    }

    const token = jwt.sign(
      { id: user.id, ingameName: user.ingameName, role: user.role }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    const { passwordHash: _ph, discordId, ...pub } = user;

    res.status(200).json({ 
      message: "로그인 성공", 
      token, 
      user: { 
        ...pub,
        discordLinked: Boolean(discordId),
        discordVerificationRequired: isDiscordVerificationEnforced(),
        discordConfig: getDiscordConfigStatus(),
      } 
    });
  } catch (error) {
    console.error("로그인 오류:", error);
    res.status(500).json({ error: "로그인 처리 중 오류가 발생했습니다." });
  }
});

export default router;
