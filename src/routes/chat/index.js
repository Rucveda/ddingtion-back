import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import roomsRoutes from "./rooms.js";
import tradeRoutes from "./trade.js";
import messagesRoutes from "./messages.js";

const router = express.Router();

router.use(authenticate);
router.use(roomsRoutes);
router.use(tradeRoutes);
router.use(messagesRoutes);

export default router;
