(function initReviewNudge(root) {
  'use strict';

  if (root.__ytmeReviewNudge) return;

  const SUCCESS_THRESHOLD = 3;
  const REPEAT_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
  const SNOOZE_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

  function safeCount(value) {
    return Number.isFinite(value) && value >= 0
      ? Math.min(Math.floor(value), 10000)
      : 0;
  }

  function safeTimestamp(value) {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function normalize(raw) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      successfulUses: safeCount(value.successfulUses),
      rated: value.rated === true,
      snoozeUntil: safeTimestamp(value.snoozeUntil),
      lastPromptAt: safeTimestamp(value.lastPromptAt),
      pulseShown: value.pulseShown === true,
    };
  }

  function recordSuccess(raw, now = Date.now()) {
    const timestamp = safeTimestamp(now) || Date.now();
    const state = normalize(raw);
    state.successfulUses = safeCount(state.successfulUses + 1);

    // Corrupt or clock-skewed persisted dates must not suppress the CTA forever.
    if (state.lastPromptAt > timestamp) state.lastPromptAt = 0;
    if (state.snoozeUntil > timestamp + SNOOZE_DELAY_MS) state.snoozeUntil = 0;

    const repeatReady = state.lastPromptAt === 0 || timestamp - state.lastPromptAt >= REPEAT_DELAY_MS;
    const shouldPrompt = !state.rated &&
      state.successfulUses >= SUCCESS_THRESHOLD &&
      timestamp >= state.snoozeUntil &&
      repeatReady;
    const shouldPulse = shouldPrompt && !state.pulseShown;

    if (shouldPrompt) state.lastPromptAt = timestamp;
    if (shouldPulse) state.pulseShown = true;

    return { state, shouldPrompt, shouldPulse };
  }

  function snooze(raw, now = Date.now()) {
    const timestamp = safeTimestamp(now) || Date.now();
    const state = normalize(raw);
    state.snoozeUntil = timestamp + SNOOZE_DELAY_MS;
    return state;
  }

  function markRated(raw) {
    const state = normalize(raw);
    state.rated = true;
    state.snoozeUntil = 0;
    return state;
  }

  const api = Object.freeze({
    SUCCESS_THRESHOLD,
    REPEAT_DELAY_MS,
    SNOOZE_DELAY_MS,
    normalize,
    recordSuccess,
    snooze,
    markRated,
  });

  root.__ytmeReviewNudge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
