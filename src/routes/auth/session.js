import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import { getClientIp } from "../../lib/strictIpBan.js";
import * as me from "../../services/auth/authMeService.js";
import * as credentials from "../../services/auth/authCredentialsService.js";
import { toPublicUser } from "../../services/auth/authShared.js";
import { handleAuthRoute } from "./authRouteHelpers.js";

const router = express.Router();

router.get(
  "/me",
  authenticate,
  handleAuthRoute(async (req, res) => {
    const user = await me.getMe(parseInt(req.user.id, 10));
    res.json(user);
  }, "계정 정보를 불러오지 못했습니다."),
);

router.post(
  "/register",
  handleAuthRoute(async (req, res) => {
    const result = await credentials.register(req.body);
    res.status(201).json(result);
  }, "서버 오류가 발생했습니다."),
);

router.post(
  "/login",
  handleAuthRoute(async (req, res) => {
    const clientIp = req.clientIp || getClientIp(req);
    const result = await credentials.login({
      loginId: req.body.loginId,
      password: req.body.password,
      rememberMe: req.body.rememberMe,
      clientIp,
    });
    res.status(200).json(result);
  }, "로그인 처리 중 오류가 발생했습니다."),
);

router.patch(
  "/me/minecraft-name",
  authenticate,
  handleAuthRoute(async (req, res) => {
    const minecraftName = String(req.body?.minecraftName || "").trim();
    const updated = await me.updateMinecraftName(parseInt(req.user.id, 10), minecraftName);
    res.json(toPublicUser(updated));
  }, "마인크래프트 닉네임 변경 실패"),
);

export default router;
