import express from "express";
import * as password from "../../services/auth/authPasswordService.js";
import { handleAuthRoute } from "./authRouteHelpers.js";

const router = express.Router();

router.post(
  "/discord/authorize",
  handleAuthRoute(async (req, res) => {
    const result = await password.startPasswordResetAuthorize(req.body?.loginId);
    res.json(result);
  }, "비밀번호 재설정 인증 시작 실패"),
);

router.post(
  "/confirm",
  handleAuthRoute(async (req, res) => {
    const result = await password.confirmPasswordReset(req.body?.token, req.body?.password);
    res.json(result);
  }, "비밀번호 재설정 실패"),
);

export default router;
