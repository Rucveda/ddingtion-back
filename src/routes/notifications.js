import express from 'express';
const router = express.Router();
import prisma from '../db.js';
import authenticateToken from '../middlewares/authMiddleware.js';

// 모든 알림 API는 로그인이 필요함
router.use(authenticateToken);

/**
 * [GET] 내 알림 목록 가져오기
 * 💡 최신 순으로 20개를 불러옵니다.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = await prisma.notification.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20 
    });

    res.json(notifications);
  } catch (error) {
    console.error("Notification Fetch Error:", error);
    res.status(500).json({ error: "알림 목록을 불러오지 못했습니다." });
  }
});

/**
 * [PATCH] 특정 알림 읽음 처리
 */
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await prisma.notification.update({
      where: { 
        id: parseInt(id),
        userId: userId 
      },
      data: { isRead: true }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Notification Update Error:", error);
    res.status(500).json({ error: "알림 업데이트 실패" });
  }
});

/**
 * 💡 [DELETE] 개별 알림 삭제 (추가됨)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await prisma.notification.delete({
      where: { 
        id: parseInt(id),
        userId: userId // 본인 알림만 삭제 가능하게 보안 강화
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Notification Delete Error:", error);
    res.status(500).json({ error: "알림 삭제 중 오류가 발생했습니다." });
  }
});

/**
 * 💡 [DELETE] 전체 알림 삭제 (추가됨)
 */
router.delete('/all/clear', async (req, res) => {
  try {
    const userId = req.user.id;

    // 해당 유저의 모든 알림 삭제
    await prisma.notification.deleteMany({
      where: { userId: userId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Notification Clear Error:", error);
    res.status(500).json({ error: "알림 내역 파기 실패" });
  }
});

export default router;