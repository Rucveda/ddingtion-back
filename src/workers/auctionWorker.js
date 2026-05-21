import { Worker } from 'bullmq';
import { createRedisClient } from '../lib/redis.js';
import { finalizeSellerCancel } from '../domain/auction/auctionCancel.js';
import { finalizeActiveAuctionEnd } from '../domain/auction/finalizeAuctionEnd.js';

// 💡 패치: 클라우드 Redis(Render, Upstash 등)를 위한 TLS 설정 및 퍼블리셔 추가
const redisConnection = createRedisClient();
const publisher = createRedisClient();

// 워커 생성
const worker = new Worker('auctionQueue', async (job) => {
  if (job.name === 'finalizeCancel') {
    const { auctionId } = job.data;
    try {
      const updated = await finalizeSellerCancel(auctionId);
      if (updated) {
        console.log(`[경매 ${auctionId}] 판매자 취소 확정 - 유찰 처리`);
      }
    } catch (error) {
      console.error(`[경매 ${auctionId}] 취소 확정 처리 중 오류:`, error);
    }
    return;
  }

  if (job.name === 'endAuction') {
    const { auctionId } = job.data;

    try {
      const outcome = await finalizeActiveAuctionEnd(auctionId, { publisher });
      if (outcome === "EXPIRED") {
        console.log(`[경매 ${auctionId}] 입찰자 없음 - 만료/유찰 처리`);
      } else if (outcome === "PENDING_TRADE") {
        console.log(`[경매 ${auctionId}] 낙찰 및 거래 대기 처리 완료`);
      }
    } catch (error) {
      console.error(`[경매 ${auctionId}] 자동 마감 처리 중 오류:`, error);
    }
  }
}, { connection: redisConnection });

console.log('🚀 경매 마감 워커(Worker) 가동 시작!');