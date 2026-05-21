import express from "express";
import * as users from "../../services/admin/adminUserService.js";
import { AdminServiceError } from "../../services/admin/adminErrors.js";
import { handleAdminRoute } from "./adminRouteHelpers.js";

const router = express.Router();

router.get(
  "/",
  handleAdminRoute(async (req, res) => {
    const result = await users.listUsers(req.query);
    res.json(result);
  }, "유저 목록 로드 실패")
);

router.patch(
  "/:id/role",
  handleAdminRoute(async (req, res) => {
    const updatedUser = await users.updateUserRole(req.params.id, req.body.role);
    res.json({
      message: `${updatedUser.ingameName}님의 권한이 ${updatedUser.role}(으)로 변경되었습니다.`,
      user: updatedUser,
    });
  }, "권한 변경 실패")
);

router.patch(
  "/:id/ban",
  handleAdminRoute(async (req, res) => {
    const user = await users.updateUserBan(req.params.id, req.body.isBanned);
    const isBanned = Boolean(req.body.isBanned);
    res.json({
      message: isBanned ? "사용자가 차단되었습니다." : "사용자 차단이 해제되었습니다.",
      isBanned: user.isBanned,
      discordLinked: Boolean(user.discordId),
    });
  }, "밴 상태 변경 실패")
);

router.patch(
  "/:id/strict-ban",
  handleAdminRoute(async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const enable = req.body?.enable !== false;
    const { user, bannedIp, enable: strictEnable } = await users.applyStrictBan(userId, enable);
    res.json({
      message: strictEnable
        ? bannedIp
          ? `${user.ingameName} 계정 및 IP(${bannedIp}) 강력 밴이 적용되었습니다.`
          : `${user.ingameName} 계정이 차단되었습니다. (최근 IP 기록 없음)`
        : `${user.ingameName} 강력 밴이 해제되었습니다.`,
      user: users.formatUserWithDiscord(user),
    });
  }, "강력 밴 처리 실패")
);

router.patch(
  "/:id/anonymize",
  handleAdminRoute(async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (Number.isNaN(userId)) {
      throw new AdminServiceError("유효하지 않은 유저 ID입니다.", 400);
    }
    const user = await users.anonymizeUser(userId, req.user?.id ? parseInt(req.user.id, 10) : null);
    res.json({
      message: "계정이 익명화되었습니다. 기존 거래 기록은 보존됩니다.",
      user: users.formatUserWithDiscord(user),
    });
  }, "계정 익명화 실패")
);

export default router;
