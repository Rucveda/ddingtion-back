# Backend layout (refactor in progress)

```
backend/
├── prisma/              # schema + migrations (unchanged)
├── src/
│   ├── app.js           # entry: Express + HTTP + Socket.io
│   ├── db.js            # Prisma client
│   ├── socket.js        # shim → realtime/setupSocket.js
│   ├── realtime/
│   │   ├── setupSocket.js
│   │   ├── auctionEvents.js
│   │   └── handlers/    # notifications, auctionBids, chat
│   ├── config/
│   │   └── env.js
│   ├── routes/          # thin HTTP handlers (/api/*)
│   │   ├── index.js     # mountApiRoutes(app)
│   │   ├── auth.js        # shim → auth/index.js
│   │   ├── auth/          # session, discord, password
│   │   ├── auctions.js    # shim → auctions/index.js
│   │   ├── auctions/      # query, market, comments, trade
│   │   ├── admin.js           # shim → admin/index.js
│   │   └── admin/             # market, moderation, items, support, auctions, users
│   │   ├── chat.js      # shim → chat/index.js
│   │   ├── chat/        # rooms, trade, messages
│   │   ├── posts.js     # shim → posts/index.js
│   │   ├── posts/       # guides, list, mutations
│   │   ├── notifications.js  # shim → notifications/index.js
│   │   ├── notifications/    # list, mutations
│   │   ├── reviews.js        # shim → reviews/index.js
│   │   └── reviews/          # create
│   ├── middlewares/
│   │   ├── authenticate.js     # JWT (canonical)
│   │   ├── authMiddleware.js   # shim → authenticate.js
│   │   ├── accessGuards.js
│   │   ├── discordCheck.js
│   │   └── requireAdmin.js     # extracted from admin routes
│   ├── domain/          # game rules + static data (no Express)
│   │   ├── auction/
│   │   │   ├── bidIncrement.js
│   │   │   └── auctionCancel.js
│   │   ├── posts/
│   │   │   ├── postCategories.js
│   │   │   └── postCategoryGuides.js
│   │   ├── trade/
│   │   │   └── tradeReport.js
│   │   └── market/
│   │       ├── enhanceTables.js
│   │       └── marketPriceEngine.js
│   ├── services/        # Prisma orchestration
│   │   ├── admin/       # admin panel business logic
│   │   ├── auth/        # login, discord, password reset
│   │   ├── auction/     # comments, market analysis cache
│   │   ├── chat/        # rooms, trade close, reports
│   │   ├── posts/       # list, create, delete, guides
│   │   ├── notifications/
│   │   └── reviews/
│   ├── lib/             # infra (redis, rate limit, queue, schema)
│   │   └── *.js         # legacy shims re-export domain/* where moved
│   └── workers/
│       └── auctionWorker.js
└── docs/
    ├── STRUCTURE.md
    └── REFACTOR_LEGACY_MAP.md
```

Deploy and DB are unchanged: same `npm start`, same Prisma migrations, same `/api` paths.
