import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import * as discord from "../../services/auth/authDiscordService.js";
import { handleAuthRoute } from "./authRouteHelpers.js";

const router = express.Router();

router.get(
  "/authorize",
  authenticate,
  handleAuthRoute(async (req, res) => {
    const result = discord.createDiscordLinkAuthorizeUrl(
      parseInt(req.user.id, 10),
      req.user.discordId,
    );
    res.json(result);
  }, "인증 URL 생성 실패"),
);

router.get("/callback", async (req, res) => {
  try {
    const result = await discord.processDiscordCallback(req.query);
    res.redirect(result.redirect);
  } catch (error) {
    console.error("Discord callback:", error);
    const { frontendBase } = await import("../../services/auth/authShared.js");
    res.redirect(`${frontendBase()}/mypage?discord=error&reason=server`);
  }
});

export default router;
