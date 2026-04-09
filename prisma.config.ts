// prisma.config.ts 파일
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"], // ✅ 여기서 URL을 주입합니다.
  },
});