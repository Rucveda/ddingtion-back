// 1. 환경 변수(.env) 로드
require('dotenv').config();

const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

/**
 * 💡 BigInt JSON 직렬화 패치
 * PostgreSQL의 BigInt(100억 등)를 JSON으로 응답할 때 문자열로 자동 변환합니다.
 */
BigInt.prototype.toJSON = function() {
  return this.toString();
};

// 2. PostgreSQL 커넥션 풀 설정
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// 3. Prisma와 PostgreSQL 연결 어댑터 설정
const adapter = new PrismaPg(pool);

// 4. Prisma 클라이언트 생성
const prisma = new PrismaClient({ 
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'], 
});

// 5. 데이터베이스 연결 테스트 로직
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log("✅ 데이터베이스(PostgreSQL) 물리적 연결 성공!");
    
    const res = await client.query('SELECT NOW()');
    console.log("✅ 쿼리 실행 테스트 성공 (서버 시간):", res.rows[0].now);
    
    client.release();
    console.log("✅ Prisma 어댑터 활성화 및 준비 완료!");
  } catch (err) {
    console.error("❌ 데이터베이스 연결 또는 초기화 실패:", err.message);
  }
};

testConnection();

module.exports = prisma;