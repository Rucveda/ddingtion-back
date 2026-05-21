/** 관리자(ADMIN) 전용 라우트 가드 */
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "인증되지 않은 사용자입니다." });
  const userRole = req.user.role ? req.user.role.toUpperCase() : "";
  if (userRole !== "ADMIN") return res.status(403).json({ error: "관리자 권한이 필요합니다." });
  next();
};

export default requireAdmin;
