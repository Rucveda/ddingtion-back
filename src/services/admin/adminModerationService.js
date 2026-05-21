import { savePostCategoryGuide } from "../../domain/posts/postCategoryGuides.js";
import { WRITABLE_POST_CATEGORIES } from "../../domain/posts/postCategories.js";
import { AdminServiceError } from "./adminErrors.js";

export const updatePostCategoryGuide = async (category, guideText) => {
  const normalized = String(category || "").trim().toUpperCase();
  if (!WRITABLE_POST_CATEGORIES.includes(normalized)) {
    throw new AdminServiceError("유효하지 않은 말머리입니다.", 400);
  }
  return savePostCategoryGuide(normalized, guideText);
};
