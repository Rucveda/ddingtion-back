const runs = new Map();
let activeRunId = null;

export const createRun = (runId, payload) => {
  if (activeRunId) {
    const err = new Error("다른 헬스체크가 실행 중입니다.");
    err.status = 409;
    throw err;
  }
  activeRunId = runId;
  const run = {
    runId,
    checkId: payload.checkId,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: payload.steps,
    meta: {},
    error: null,
  };
  runs.set(runId, run);
  return run;
};

export const getRun = (runId) => runs.get(runId) || null;

export const getLatestRun = (checkId) => {
  const list = [...runs.values()]
    .filter((r) => r.checkId === checkId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return list[0] || null;
};

export const updateRunStep = (runId, stepId, patch) => {
  const run = runs.get(runId);
  if (!run) return null;
  run.steps = run.steps.map((step) =>
    step.id === stepId ? { ...step, ...patch } : step,
  );
  return run;
};

export const finishRun = (runId, { status, error = null, meta = {} }) => {
  const run = runs.get(runId);
  if (!run) return null;
  run.status = status;
  run.error = error;
  run.meta = { ...run.meta, ...meta };
  run.finishedAt = new Date().toISOString();
  if (activeRunId === runId) activeRunId = null;
  return run;
};

export const setRunMeta = (runId, meta) => {
  const run = runs.get(runId);
  if (!run) return null;
  run.meta = { ...run.meta, ...meta };
  return run;
};
