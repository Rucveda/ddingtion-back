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
const minecraftNamePattern = /^[A-Za-z0-9_]{3,16}$/;
const roleForDiscordVerifiedUser = (role = "USER") => {
  const normalized = role.toUpperCase();
  return normalized === "USER" ? "WRITER" : normalized;
};

const publicUserSelect = {
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
};

const toPublicUser = (user) => {
  const { discordId, ...rest } = user;
  return {
    ...rest,
    discordLinked: Boolean(discordId),
    discordVerificationRequired: isDiscordVerificationEnforced(),
    discordConfig: getDiscordConfigStatus(),
  };
};

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
 * [POST] /api/auth/password-reset/discord/authorize
 * Discord OAuth로 계정 소유를 확인한 뒤 비밀번호 재설정을 시작합니다.
 */
router.post('/password-reset/discord/authorize', async (req, res) => {
  try {
    if (!isDiscordVerificationEnforced()) {
      return res.status(503).json({ error: "디스코드 인증이 서버에서 설정되지 않았습니다." });
    }

    const loginId = String(req.body?.loginId || "").trim();
    if (!loginId) {
      return res.status(400).json({ error: "마인크래프트 닉네임을 입력해주세요." });
    }

    const user = await prisma.user.findUnique({
      where: { loginId },
      select: { id: true, isBanned: true, discordId: true },
    });

    if (!user || user.isBanned || !user.discordId) {
      return res.status(400).json({ error: "Discord 인증으로 재설정할 수 없는 계정입니다." });
    }

    const state = jwt.sign(
      { purpose: "password_reset", uid: user.id },
      JWT_SECRET,
      { expiresIn: "10m" },
    );
    res.json({ url: buildDiscordAuthorizeUrl(state) });
  } catch (error) {
    console.error("Password reset authorize:", error);
    res.status(500).json({ error: error.message || "비밀번호 재설정 인증 시작 실패" });
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
  const resetOk = (token) =>
    res.redirect(`${frontendBase()}/reset-password?token=${encodeURIComponent(token)}`);

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
    if (!["discord_oauth", "password_reset"].includes(payload.purpose) || !payload.uid) {
      return fail("invalid_state");
    }

    const userId = parseInt(payload.uid, 10);
    if (isNaN(userId)) return fail("invalid_state");

    const appUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!appUser || appUser.isBanned) {
      return fail("forbidden");
    }
    if (payload.purpose === "discord_oauth" && appUser.discordId) {
      if (appUser.role?.toUpperCase() === "USER") {
        await prisma.user.update({
          where: { id: userId },
          data: { role: "WRITER" },
        });
      }
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
    if (payload.purpose === "password_reset") {
      if (!appUser.discordId || appUser.discordId !== discordId) {
        return fail("reset_discord_mismatch");
      }
      const resetToken = jwt.sign(
        { purpose: "password_reset_confirm", uid: appUser.id },
        JWT_SECRET,
        { expiresIn: "15m" },
      );
      return resetOk(resetToken);
    }

    const holder = await prisma.user.findUnique({ where: { discordId } });
    if (holder && holder.id !== userId) {
      if (holder.isBanned) return fail("in_use_banned");
      return fail("in_use");
    }

    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          discordId,
          role: roleForDiscordVerifiedUser(appUser.role),
        },
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
        reputationScore: 0,
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
 * [POST] /api/auth/password-reset/confirm
 * Discord OAuth로 발급된 reset token으로 새 비밀번호를 저장합니다.
 */
router.post('/password-reset/confirm', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: "재설정 토큰과 새 비밀번호를 입력해주세요." });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다." });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: "재설정 링크가 만료되었습니다. 다시 시도해 주세요." });
    }

    if (payload.purpose !== "password_reset_confirm" || !payload.uid) {
      return res.status(400).json({ error: "유효하지 않은 재설정 토큰입니다." });
    }

    const userId = parseInt(payload.uid, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "유효하지 않은 계정 정보입니다." });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBanned: true },
    });
    if (!user || user.isBanned) {
      return res.status(403).json({ error: "비밀번호를 재설정할 수 없는 계정입니다." });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    res.json({ message: "비밀번호가 재설정되었습니다." });
  } catch (error) {
    console.error("Password reset confirm:", error);
    res.status(500).json({ error: "비밀번호 재설정 실패" });
  }
});

/**
 * [PATCH] /api/auth/me/minecraft-name
 * 로그인 ID와 표시 닉네임을 Minecraft 닉네임 기준으로 함께 변경합니다.
 */
router.patch('/me/minecraft-name', authenticateToken, async (req, res) => {
  try {
    const minecraftName = String(req.body?.minecraftName || "").trim();
    if (!minecraftNamePattern.test(minecraftName)) {
      return res.status(400).json({ error: "마인크래프트 닉네임은 영문, 숫자, _ 조합의 3~16자여야 합니다." });
    }

    const userId = parseInt(req.user.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "유효하지 않은 유저 식별자입니다." });

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBanned: true },
    });
    if (!currentUser || currentUser.isBanned) {
      return res.status(403).json({ error: "차단된 계정은 정보를 변경할 수 없습니다." });
    }

    const existing = await prisma.user.findFirst({
      where: {
        id: { not: userId },
        OR: [{ loginId: minecraftName }, { ingameName: minecraftName }],
      },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ error: "이미 사용 중인 마인크래프트 닉네임입니다." });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { loginId: minecraftName, ingameName: minecraftName },
      select: publicUserSelect,
    });

    res.json(toPublicUser(updated));
  } catch (error) {
    console.error("Minecraft name update:", error);
    res.status(500).json({ error: "마인크래프트 닉네임 변경 실패" });
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

    if (user.discordId && user.role?.toUpperCase() === "USER") {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "WRITER" },
      });
      user.role = "WRITER";
    }

    const rememberMe = req.body?.rememberMe === true || req.body?.rememberMe === "true";
    const token = jwt.sign(
      { id: user.id, ingameName: user.ingameName, role: user.role },
      JWT_SECRET,
      { expiresIn: rememberMe ? "30d" : "24h" },
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
