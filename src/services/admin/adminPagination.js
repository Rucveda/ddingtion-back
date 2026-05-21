export const getPagination = (query, defaultLimit = 30, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const requestedLimit = parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, requestedLimit));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export const paginatedResponse = ({ items, total, page, limit }) => ({
  items,
  pagination: {
    page,
    limit,
    total,
    hasMore: page * limit < total,
  },
});
