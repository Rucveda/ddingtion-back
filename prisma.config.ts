// prisma.config.ts 파일
import "dotenv/config";
import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"], // Render는 보통 DATABASE_URL만 제공합니다.
  },
});