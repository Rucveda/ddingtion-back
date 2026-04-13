// prisma.config.ts 파일
import "dotenv/config";
import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DIRECT_URL"], // 💡 패치: 터미널 명령어(db push)는 5432 포트를 사용하도록 변경
  },
});