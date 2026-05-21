# Backend refactor legacy map (machine-readable)

refactor_started: 2026-05-21
deploy_model: separate from `frontend/`; API + socket contracts must stay stable.

## phase_1_done

| change | notes |
|--------|-------|
| `domain/auction/bidIncrement.js` | moved from `lib/bidIncrement.js`; shim at old path |
| `domain/auction/auctionCancel.js` | moved from `lib/auctionCancel.js`; shim at old path |
| `domain/posts/postCategories.js` | moved from `lib/postCategories.js` |
| `domain/posts/postCategoryGuides.js` | moved from `lib/postCategoryGuides.js` |
| `domain/trade/tradeReport.js` | moved from `lib/tradeReport.js` |
| `middlewares/requireAdmin.js` | was inline `isAdmin` in `routes/admin.js` |
| `routes/index.js` | `mountApiRoutes(app)` — same mounts as before |
| `getAuctionQueue()` | `admin.js` / `auctions.js` no longer `new Queue()` each |

## path_migration (canonical → legacy shim)

| canonical | legacy shim (still works) |
|-----------|---------------------------|
| `src/domain/auction/bidIncrement.js` | `src/lib/bidIncrement.js` |
| `src/domain/auction/auctionCancel.js` | `src/lib/auctionCancel.js` |
| `src/domain/posts/postCategories.js` | `src/lib/postCategories.js` |
| `src/domain/posts/postCategoryGuides.js` | `src/lib/postCategoryGuides.js` |
| `src/domain/trade/tradeReport.js` | `src/lib/tradeReport.js` |
| `src/domain/market/marketPriceEngine.js` | `src/services/marketAnalysisService.js` |
| `src/realtime/setupSocket.js` | `src/socket.js` |
| `src/routes/auth/index.js` | `src/routes/auth.js` |
| `src/middlewares/authenticate.js` | `src/middlewares/authMiddleware.js` |
| `src/routes/auctions/index.js` | `src/routes/auctions.js` |
| `src/routes/chat/index.js` | `src/routes/chat.js` |
| `src/routes/posts/index.js` | `src/routes/posts.js` |
| `src/routes/notifications/index.js` | `src/routes/notifications.js` |
| `src/routes/reviews/index.js` | `src/routes/reviews.js` |

## import_preference

```
../domain/auction/bidIncrement.js
../domain/auction/auctionCancel.js
../domain/posts/postCategories.js
../middlewares/requireAdmin.js
../lib/auctionQueueJobs.js   # getAuctionQueue, rescheduleAuctionEndJob
../lib/redis.js
../lib/rateLimit.js
../services/*
```

## api_unchanged

- REST mounts: `/api/auth`, `/api/auctions`, `/api/admin`, `/api/chat`, `/api/notifications`, `/api/reviews`, `/api/posts`
- Socket events: `place_bid`, `join_room`, `send_message`, `setup_notifications` (`src/socket.js`)
- Prisma schema: `prisma/schema.prisma` — **no migration in phase 1**

## frontend_parity

| backend domain | frontend mirror |
|----------------|-----------------|
| `domain/auction/bidIncrement.js` | `frontend/lib/domain/bidIncrement.ts` |
| `domain/posts/postCategories.js` | `frontend/lib/domain/postCategories.ts` |

Still duplicate files (not a shared package).

## phase_2_done

| change | notes |
|--------|-------|
| `routes/admin/index.js` + sub-routers | `market`, `moderation`, `items`, `support`, `auctions`, `users` |
| `routes/admin.js` | shim: `export { default } from './admin/index.js'` |
| `services/admin/*` | market, moderation, items, support, auctions, users, pagination, errors |
| `lib/admin/supabaseStorage.js` | item image upload/remove (was inline in admin routes) |

API paths unchanged under `/api/admin/*`.

## phase_3_done

| change | notes |
|--------|-------|
| `domain/market/enhanceTables.js` | static enhance/skill tables |
| `domain/market/marketPriceEngine.js` | fair price, inference, `buildMarketAnalysis` |
| `services/marketAnalysisService.js` | shim re-export |
| `routes/auth/index.js` + sub-routers | session, discord, password-reset |
| `services/auth/*` | me, credentials, discord, password |
| `realtime/setupSocket.js` + handlers | bids, chat, notifications; `socket.js` shim |

Script: `scripts/refactor-market-phase3.mjs` (destructive to old monolith service file).

## phase_4_done

| change | notes |
|--------|-------|
| `middlewares/authenticate.js` | canonical JWT middleware; `authMiddleware.js` shim |
| `routes/auctions/index.js` + sub-routers | query, market, comments, trade |
| `services/auction/auctionCommentService.js` | comment list/create + notification |
| `services/auction/marketAnalysisCache.js` | imports `domain/market/marketPriceEngine.js` directly |
| `routes/auctions.js` | shim |

## phase_5_done

| change | notes |
|--------|-------|
| `routes/chat/index.js` + sub-routers | rooms, trade, messages |
| `services/chat/*` | room list, admin room, trade close, report, messages |
| `routes/posts/index.js` + sub-routers | guides, list, mutations |
| `services/posts/*` | uses `domain/posts/*` directly |
| `routes/chat.js`, `routes/posts.js` | shims |

## phase_6_done

| change | notes |
|--------|-------|
| `routes/notifications/index.js` | list + mutations (`/all/clear` before `/:id`) |
| `services/notifications/notificationService.js` | list, read, delete, clear |
| `routes/reviews/index.js` + `create.js` | POST review |
| `services/reviews/reviewService.js` | trade verification + reputation update |
| `routes/notifications.js`, `routes/reviews.js` | shims |

## phase_6_planned
- Optional: `src/server.js` rename from `app.js` (update `package.json` main)

## scripts

- `scripts/refactor-backend-phase1.mjs` — domain moves + lib shims (re-run only on fresh copies; destructive to full lib files)
- `scripts/refactor-market-phase3.mjs` — split market analysis into `domain/market/*`

## db_compatibility

**Yes.** Phase 1 does not change Prisma schema, migrations, or SQL. Existing PostgreSQL data is compatible.
