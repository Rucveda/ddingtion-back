import { Worker } from 'bullmq';
import prisma from '../db.js';
import { createRedisClient } from '../lib/redis.js';
import { finalizeSellerCancel } from '../lib/auctionCancel.js';

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
      // 1. 해당 경매 정보와 입찰 기록 조회
      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
        include: { 
          // 💡 패치: 낙찰자 이름을 클라이언트에 전달하기 위해 bidder 정보 포함
          bids: { orderBy: { bidAmount: 'desc' }, take: 1, include: { bidder: { select: { ingameName: true } } } },
          item: true
        }
      });

      // 이미 종료된 경매거나 없으면 패스
      if (!auction || auction.status !== 'ACTIVE') return;

      const lastBid = auction.bids[0];

      if (!lastBid) {
        // 💡 입찰자 없이 종료된 경우
        await prisma.auction.update({
          where: { id: auctionId },
          data: { status: 'EXPIRED' }
        });
        console.log(`[경매 ${auctionId}] 입찰자 없음 - 만료/유찰 처리`);
      } else {
        // 💡 낙찰자가 있는 경우 (트랜잭션)
        await prisma.$transaction([
          // 경매 상태 변경
          prisma.auction.update({
            where: { id: auctionId },
            data: { status: 'PENDING_TRADE' }
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
              message: `축하합니다! [${auction.item.name}] 경매에 낙찰되셨습니다. 채팅에서 거래를 확정해주세요!`,
              link: `/auction/${auctionId}`
            }
          }),
        ]);
        
        // 💡 핵심 패치: 워커가 백엔드 소켓 서버(socket.js)에게 경매 종료 이벤트를 발송하여 모든 유저의 화면을 갱신
        const eventPayload = { auctionId, winner: lastBid.bidder.ingameName, price: lastBid.bidAmount.toString(), reason: 'BID_WIN' };
        await publisher.publish('auction-events', JSON.stringify(eventPayload));
        
        console.log(`[경매 ${auctionId}] 낙찰 성공 - 구매자: ${lastBid.bidder.ingameName}`);
      }
    } catch (error) {
      console.error(`[경매 ${auctionId}] 자동 마감 처리 중 오류:`, error);
    }
  }
}, { connection: redisConnection });

console.log('🚀 경매 마감 워커(Worker) 가동 시작!');