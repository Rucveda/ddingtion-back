// 특정 등급 이상의 유저만 허용하는 미들웨어
const checkRole = (requiredRoles) => {
  return (req, res, next) => {
    // authenticateToken 미들웨어를 거쳐 req.user가 존재한다고 가정
    if (!req.user || !requiredRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "글 작성 권한이 없습니다." });
    }
    next();
  };
};

export { checkRole };