import express from "express";
import guidesRoutes from "./guides.js";
import listRoutes from "./list.js";
import mutationsRoutes from "./mutations.js";

const router = express.Router();

router.use(guidesRoutes);
router.use(listRoutes);
router.use(mutationsRoutes);

export default router;
