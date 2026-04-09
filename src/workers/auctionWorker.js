import 'dotenv/config';

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const prisma = require('../db');

// Redis 연결
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

// 워커 생성
const worker = new Worker('auctionQueue', async (job) => {
  if (job.name === 'endAuction') {
    const { auctionId } = job.data;

    try {
      // 1. 해당 경매 정보와 입찰 기록 조회
      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
        include: { bids: { orderBy: { bidAmount: 'desc' }, take: 1 } }
      });

      // 이미 종료된 경매거나 없으면 패스
      if (!auction || auction.status !== 'ACTIVE') return;

      const lastBid = auction.bids[0];

      if (!lastBid) {
        // 💡 입찰자 없이 종료된 경우
        await prisma.auction.update({
          where: { id: auctionId },
          data: { status: 'CANCELLED' } // 또는 'EXPIRED'
        });
        console.log(`[경매 ${auctionId}] 입찰자 없음 - 유찰 처리`);
      } else {
        // 💡 낙찰자가 있는 경우 (트랜잭션)
        await prisma.$transaction([
          // 경매 상태 변경
          prisma.auction.update({
            where: { id: auctionId },
            data: { status: 'COMPLETED' }
          }),
          // 채팅방 자동 개설 (구매자-판매자 연결)
          prisma.chatRoom.create({
            data: {
              auctionId: auction.id,
              sellerId: auction.sellerId,
              buyerId: lastBid.bidderId,
              isAdminChat: false
            }
          }),
          // 낙찰 알림 생성
          prisma.notification.create({
            data: {
              userId: lastBid.bidderId,
              type: 'TRADE',
              message: `축하합니다! [${auctionId}]번 경매에 낙찰되셨습니다. 채팅을 확인하세요!`,
              link: `/auction/${auctionId}`
            }
          })
        ]);
        console.log(`[경매 ${auctionId}] 낙찰 성공 - 구매자 ID: ${lastBid.bidderId}`);
      }
    } catch (error) {
      console.error(`[경매 ${auctionId}] 자동 마감 처리 중 오류:`, error);
    }
  }
}, { connection: redisConnection });

console.log('🚀 경매 마감 워커(Worker) 가동 시작!');