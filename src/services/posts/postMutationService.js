import prisma from "../../db.js";
import { normalizeWritablePostCategory } from "../../domain/posts/postCategories.js";
import { PostServiceError } from "./postErrors.js";

export const createPost = async ({ authorId, title, content, type = "GENERAL", category = "WILD", userRole }) => {
  const role = userRole ? userRole.toUpperCase() : "USER";
  const postType = type.toUpperCase();

  if (postType === "NOTICE" && role !== "ADMIN") {
    throw new PostServiceError("공지사항 작성 권한이 없습니다.", 403);
  }
  if (!title || !content) {
    throw new PostServiceError("제목과 내용을 입력해주세요.", 400);
  }

  return prisma.post.create({
    data: {
      title,
      content,
      type: postType,
      category: postType === "GENERAL" ? normalizeWritablePostCategory(category) : "NOTICE",
      authorId,
    },
  });
};

export const deletePost = async (postId, userId, userRole) => {
  if (Number.isNaN(postId)) {
    throw new PostServiceError("유효하지 않은 게시글 ID입니다.", 400);
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
  });

  if (!post) {
    throw new PostServiceError("게시글을 찾을 수 없습니다.", 404);
  }
  if (post.authorId !== userId && userRole.toUpperCase() !== "ADMIN") {
    throw new PostServiceError("삭제 권한이 없습니다.", 403);
  }

  await prisma.post.delete({ where: { id: postId } });
  return { message: "게시글이 삭제되었습니다." };
};
