import express from "express";
import * as items from "../../services/admin/adminItemsService.js";
import { handleAdminRoute } from "./adminRouteHelpers.js";
import { itemImageUpload } from "./multerUpload.js";

const router = express.Router();

router.get(
  "/",
  handleAdminRoute(async (_req, res) => {
    const list = await items.listItems();
    res.json(list);
  }, "아이템 목록 로드 실패")
);

router.post(
  "/",
  itemImageUpload,
  handleAdminRoute(async (req, res) => {
    const newItem = await items.createItem({
      name: req.body.name,
      category: req.body.category,
      file: req.file,
    });
    res.status(201).json(newItem);
  }, "아이템 등록 중 서버 오류가 발생했습니다.")
);

router.delete(
  "/:id",
  handleAdminRoute(async (req, res) => {
    await items.deleteItem(parseInt(req.params.id, 10));
    res.json({ message: "아이템 및 클라우드 이미지 삭제 완료" });
  }, "삭제 중 서버 오류")
);

export default router;
