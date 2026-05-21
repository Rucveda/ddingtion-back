import express from "express";
import createRoutes from "./create.js";

const router = express.Router();

router.use(createRoutes);

export default router;
