import express from "express";
import sessionRoutes from "./session.js";
import discordRoutes from "./discord.js";
import passwordRoutes from "./password.js";

const router = express.Router();

router.use(sessionRoutes);
router.use("/discord", discordRoutes);
router.use("/password-reset", passwordRoutes);

export default router;
