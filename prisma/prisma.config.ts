// 💡 .env 파일의 DATABASE_URL을 인식하기 위해 호출합니다.
import 'dotenv/config'; 
import { defineConfig } from '@prisma/config';

export default defineConfig({
  /**
   * 1. 스키마 파일 경로 설정
   * 프로젝트 루트를 기준으로 schema.prisma 파일이 있는 위치를 지정합니다.
   */
  schema: './prisma/schema.prisma', 

  /**
   * 2. 데이터베이스 연결 설정
   * Prisma 7부터는 schema.prisma 내부가 아닌 여기서 URL을 관리합니다.
   */
  datasource: {
    url: process.env.DATABASE_URL,
    // @ts-ignore: Prisma 7의 타입 정의가 아직 IDE에 완벽히 반영되지 않아 생기는 경고 무시
    directUrl: process.env.DIRECT_URL,
  },

  /**
   * 💡 주의: 'generator' 블록은 여기서 정의하지 않습니다.
   * 해당 설정은 오직 'schema.prisma' 파일 상단에만 작성해야 
   * 타입 에러(Object literal may only specify known properties)가 발생하지 않습니다.
   */
});