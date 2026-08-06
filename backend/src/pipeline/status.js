export const status = {
  running: false,
  startedAt: null,
  finishedAt: null,
  total: 0,
  completed: 0,
  currentTitle: null,
  errors: [],
};

export function resetStatus(total) {
  status.running = true;
  status.startedAt = new Date().toISOString();
  status.finishedAt = null;
  status.total = total;
  status.completed = 0;
  status.currentTitle = null;
  status.errors = [];
}

export function finishStatus() {
  status.running = false;
  status.finishedAt = new Date().toISOString();
  status.currentTitle = null;
}
