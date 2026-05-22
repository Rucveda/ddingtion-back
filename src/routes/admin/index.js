import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import requireAdmin from "../../middlewares/requireAdmin.js";
import marketRoutes from "./market.js";
import moderationRoutes from "./moderation.js";
import itemsRoutes from "./items.js";
import supportRoutes from "./support.js";
import auctionsRoutes from "./auctions.js";
import usersRoutes from "./users.js";
import reportsRoutes from "./reports.js";
const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

router.use("/market", marketRoutes);
router.use(moderationRoutes);
router.use("/items", itemsRoutes);
router.use("/support", supportRoutes);
router.use("/auctions", auctionsRoutes);
router.use("/users", usersRoutes);
router.use("/reports", reportsRoutes);

export default router;
