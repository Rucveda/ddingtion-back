import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import listRoutes from "./list.js";
import mutationsRoutes from "./mutations.js";

const router = express.Router();

router.use(authenticate);
router.use(listRoutes);
router.use(mutationsRoutes);

export default router;
