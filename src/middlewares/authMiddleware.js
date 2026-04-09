import jwt from 'jsonwebtoken';
import prisma from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_123';

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "로그인이 필요한 서비스입니다." });
  }

  try {
    // 1. 토큰 자체의 유효성 검사
    const decoded = jwt.verify(token, JWT_SECRET);

    // 💡 에러 방지 핵심 패치: 토큰 페이로드에서 ID 추출 (id 또는 userId 둘 다 대응)
    // Prisma 조회 시 undefined가 들어가는 것을 원천 차단합니다.
    const targetId = decoded.id || decoded.userId;

    if (!targetId) {
      console.error("❌ 토큰 내 유저 식별 정보가 없습니다:", decoded);
      return res.status(403).json({ error: "유효하지 않은 인증 토큰입니다." });
    }

    // 2. 실제 DB 유저 존재 여부 확인
    const user = await prisma.user.findUnique({
      where: { id: parseInt(targetId) }, // 정수형 변환 추가 (안전장치)
      select: { 
        id: true, 
        role: true, 
        ingameName: true 
      }
    });

    if (!user) {
      // DB가 리셋되었거나 유저가 삭제된 경우
      return res.status(401).json({ error: "존재하지 않는 계정 정보입니다. 다시 로그인해주세요." });
    }

    // 3. 검증된 유저 정보를 req.user에 저장
    req.user = user; 
    next();
    
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: "세션이 만료되었습니다. 다시 로그인해주세요." });
    }
    return res.status(403).json({ error: "유효하지 않은 인증 세션입니다." });
  }
};

export default authenticateToken;