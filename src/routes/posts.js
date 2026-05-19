import express from 'express';
const router = express.Router();
import prisma from '../db.js';
import authenticateToken from '../middlewares/authMiddleware.js';
import { checkDiscordLinked } from '../middlewares/discordCheck.js';
import { rejectBannedAccount } from '../middlewares/accessGuards.js';
import {
  isKnownPostCategory,
  normalizeWritablePostCategory,
} from '../lib/postCategories.js';
import { loadPostCategoryGuides } from '../lib/postCategoryGuides.js';

/**
 * 말머리별 안내 문구 (공개 조회)
 */
router.get('/category-guides', async (req, res) => {
  try {
    const guides = await loadPostCategoryGuides();
    res.json({ guides });
  } catch (error) {
    console.error("❌ GET /api/posts/category-guides Error:", error);
    res.status(500).json({ error: "말머리 안내 로드 실패" });
  }
});

/**
 * 글 목록 조회
 */
router.get('/', async (req, res) => {
  try {
    const { type, category } = req.query;
    let whereClause = {};
    
    const isNoticeRequest = type && type.toUpperCase() === 'NOTICE';

    if (type) {
      whereClause.type = type.toUpperCase(); 
    }
    if (category && String(category).toUpperCase() !== 'ALL') {
      const normalized = String(category).trim().toUpperCase();
      if (isKnownPostCategory(normalized)) {
        whereClause.category = normalized;
      }
    }

    const posts = await prisma.post.findMany({
      where: whereClause,
      take: isNoticeRequest ? 1 : 50,
      include: {
        author: {
          select: { ingameName: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(posts);
  } catch (error) {
    console.error("❌ GET /api/posts Error:", error);
    res.status(500).json({ error: "게시글 로드 실패" });
  }
});

/**
 * [POST] 글 작성 (권한 검증 포함)
 */
router.post('/', authenticateToken, rejectBannedAccount, checkDiscordLinked, async (req, res) => {
  try {
    const { title, content, type = "GENERAL", category = "WILD" } = req.body;
    const userRole = req.user.role ? req.user.role.toUpperCase() : 'USER';
    const postType = type.toUpperCase();

    if (postType === 'NOTICE' && userRole !== 'ADMIN') {
      return res.status(403).json({ error: "공지사항 작성 권한이 없습니다." });
    }

    if (!title || !content) {
      return res.status(400).json({ error: "제목과 내용을 입력해주세요." });
    }

    const post = await prisma.post.create({
      data: {
        title,
        content,
        type: postType,
        category: postType === 'GENERAL' ? normalizeWritablePostCategory(category) : 'NOTICE',
        authorId: req.user.id
      }
    });

    res.status(201).json(post);
  } catch (error) {
    console.error("❌ POST /api/posts Error:", error);
    res.status(500).json({ error: "게시글 작성 실패" });
  }
});

/**
 * [DELETE] 게시글 삭제
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user.id;
    const userRole = req.user.role.toUpperCase();

    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
    }

    if (post.authorId !== userId && userRole !== 'ADMIN') {
      return res.status(403).json({ error: "삭제 권한이 없습니다." });
    }

    await prisma.post.delete({
      where: { id: postId }
    });

    res.json({ message: "게시글이 삭제되었습니다." });
  } catch (error) {
    console.error("❌ DELETE /api/posts Error:", error);
    res.status(500).json({ error: "삭제 실패" });
  }
});

export default router;
