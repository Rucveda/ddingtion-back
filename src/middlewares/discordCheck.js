import { isDiscordVerificationEnforced } from "../config/env.js";

/**
 * 디스코드 연동(인증) 여부 검사.
 * OAuth 환경변수가 설정된 경우에만 강제하며, 미설정 시 기존과 동일하게 통과합니다.
 */
const checkDiscordLinked = (req, res, next) => {
  if (!isDiscordVerificationEnforced()) {
    return next();
  }
  if (!req.user || !req.user.discordId) {
    return res.status(403).json({
      code: "DISCORD_REQUIRED",
      error:
        "디스코드 인증이 필요합니다. 마이페이지에서 계정을 연동한 뒤 입찰·구매할 수 있습니다.",
    });
  }
  next();
};

export { checkDiscordLinked };