CREATE TABLE IF NOT EXISTS "PostCategoryGuide" (
  "category" TEXT NOT NULL,
  "guideText" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostCategoryGuide_pkey" PRIMARY KEY ("category")
);
