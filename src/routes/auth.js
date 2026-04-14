import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import authenticateToken from '../middlewares/authMiddleware.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_123';

/**
 * [GET] /api/auth/me
 * 💡 마이페이지 실시간 데이터 동기화
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // 💡 패치: req.user.id가 확실한 숫자인지 보장 (Prisma undefined 에러 방지)
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
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: "관리자에 의해 차단된 계정입니다." });
    }

    res.json(user);
  } catch (error) {
    console.error("내 정보 조회 오류:", error);
    res.status(500).json({ error: "계정 정보를 불러오지 못했습니다." });
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

    // 💡 패치: 입력값 공백 제거 (아이디/닉네임 앞뒤 공백으로 인한 로그인 실패 방지)
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
        role: newUser.role
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

    const user = await prisma.user.findUnique({ where: { loginId } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "아이디 또는 비밀번호가 잘못되었습니다." });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: "관리자에 의해 차단된 계정입니다. 접속할 수 없습니다." });
    }

    // 💡 페이로드 키를 'id'로 통일 (미들웨어와 호환성 확보)
    const token = jwt.sign(
      { id: user.id, ingameName: user.ingameName, role: user.role }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.status(200).json({ 
      message: "로그인 성공", 
      token, 
      user: { 
        id: user.id, 
        loginId: user.loginId, 
        ingameName: user.ingameName,
        role: user.role,
        reputationScore: user.reputationScore,
        reviewCount: user.reviewCount
      } 
    });
  } catch (error) {
    console.error("로그인 오류:", error);
    res.status(500).json({ error: "로그인 처리 중 오류가 발생했습니다." });
  }
});

export default router;