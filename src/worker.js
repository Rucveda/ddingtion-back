const { Worker } = require('bullmq');
const Redis = require('ioredis');
const prisma = require('./db');

const redisConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const worker = new Worker('auctionQueue', async job => {
  const { auctionId } = job.data;
  try {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({ 
        where: { id: auctionId },
        include: { bids: { orderBy: { bidAmount: 'desc' }, take: 1 } }
      });
      if (!auction || auction.status !== 'ACTIVE') return;

      const winner = auction.bids[0];
      if (winner) {
        await tx.auction.update({ where: { id: auction.id }, data: { status: 'PENDING_TRADE' } });
        await tx.chatRoom.create({ data: { auctionId, sellerId: auction.sellerId, buyerId: winner.bidderId } });
      } else {
        await tx.auction.update({ where: { id: auction.id }, data: { status: 'CANCELED' } });
      }
    });
  } catch (e) { console.error(e); }
}, { connection: redisConnection });