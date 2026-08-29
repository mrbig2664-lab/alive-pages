import { createId, getRecord, upsertRecord } from './store.js';

export const TIMEZONE = 'Asia/Shanghai';
export const RULE_VERSION = 'slice01-v1';
export const PLANT_STAGES = ['stage_01', 'stage_02', 'stage_03', 'stage_04', 'stage_05', 'stage_06'];
export const EGG_STAGES = ['stage_01', 'stage_02', 'stage_03', 'stage_04', 'stage_05', 'stage_06'];
export const NURTURE_TARGETS = ['plant', 'egg', 'outside'];

export function localDateKey(date = new Date(), timezone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function localTime(date = new Date(), timezone = TIMEZONE) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function dateLabel(dateKey, timezone = TIMEZONE) {
  const date = new Date(`${dateKey}T12:00:00+08:00`);
  return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, month: 'long', day: 'numeric', weekday: 'short' }).format(date).replace('星期', '周');
}

export function activeSmokeEvents(state, dateKey) {
  const corrections = new Set(state.events.filter(event => event.type === 'smokeCorrection' && event.targetEventId).map(event => event.targetEventId));
  return state.events.filter(event => event.type === 'smoke' && event.localDate === dateKey && !event.tombstone && !corrections.has(event.id));
}

export function smokeCount(state, dateKey) { return activeSmokeEvents(state, dateKey).length; }
export function lastSmokeEvent(state, dateKey) { return activeSmokeEvents(state, dateKey).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1) || null; }
export function currentCheckin(state, dateKey) { return getRecord(state, `checkin:${dateKey}`); }
export function currentSettlement(state, dateKey) { return getRecord(state, `settlement:${dateKey}`); }
export function currentEncounter(state) { return getRecord(state, 'encounter:smokeBeast'); }
export function pendingCount(state) { return state.events.filter(event => event.syncStatus === 'pending').length; }

export function currentFocus(state, dateKey) {
  return getRecord(state, `focus:${dateKey}`) || {
    key: `focus:${dateKey}`, type: 'dailyFocus', localDate: dateKey, focusType: 'smoke', target: 10,
    recommendedBy: 'smokeTrend', userChanged: false, status: 'active', recoveryAdjusted: false, ruleVersion: RULE_VERSION
  };
}

export function normalizePlantStage(stage) {
  if (stage === 'stageA') return 'stage_01';
  if (stage === 'stageB') return 'stage_02';
  return PLANT_STAGES.includes(stage) ? stage : 'stage_01';
}

export function normalizeEggStage(stage) { return EGG_STAGES.includes(stage) ? stage : 'stage_01'; }
export function stageNumber(stage, stages = PLANT_STAGES) { return Math.max(1, stages.indexOf(stage) + 1); }
export function nextStage(stage, stages = PLANT_STAGES) { return stages[Math.min(stages.length - 1, stageNumber(stage, stages))]; }
export function currentSeedLedger(state, dateKey) { return getRecord(state, `lifeSeeds:${dateKey}`); }

export function dailySeedReward(state, dateKey) {
  const checkin = currentCheckin(state, dateKey);
  if (!checkin) return 0;
  const focus = currentFocus(state, dateKey);
  const count = smokeCount(state, dateKey);
  let reward = 1;
  if (count > 0) reward += 1;
  if (count <= Number(focus.target || 10)) reward += 1;
  if (checkin.energy >= 4 || checkin.bodyFeel >= 4) reward += 1;
  if (checkin.food === '清爽') reward += 1;
  return Math.min(5, reward);
}

export function ensureDailySeeds(state, dateKey) {
  const existing = currentSeedLedger(state, dateKey);
  if (existing) return existing;
  const earned = dailySeedReward(state, dateKey);
  const ledger = { key: `lifeSeeds:${dateKey}`, type: 'lifeSeeds', id: `life-seeds-${dateKey}`, localDate: dateKey, earned, remaining: earned, allocated: 0, allocations: { plant: 0, egg: 0, outside: 0 }, finalized: false, ruleVersion: RULE_VERSION };
  upsertRecord(state, ledger);
  return getRecord(state, ledger.key);
}

export function seedJarStageForBalance(balance) {
  if (balance <= 0) return 'empty';
  if (balance <= 2) return 'low';
  if (balance <= 5) return 'medium';
  if (balance <= 8) return 'almost_full';
  return 'full';
}

export function hasLifeRecord(state, dateKey, type) { return state.records.some(record => record.localDate === dateKey && record.type === type && !record.tombstone); }

export function createLifeRecord(state, dateKey, type, extra = {}) {
  const now = new Date().toISOString();
  const record = { key: `${type}:${dateKey}:${now}`, id: `${type}-${now}`, type, localDate: dateKey, occurredAt: now, timezone: state.timezone, source: 'quickLog', ruleVersion: RULE_VERSION, ...extra };
  upsertRecord(state, record);
  return record;
}

export function allocateLifeSeed(state, dateKey, target) {
  if (!NURTURE_TARGETS.includes(target)) return { ok: false, reason: 'unknownTarget' };
  const ledger = ensureDailySeeds(state, dateKey);
  const current = Number(ledger.allocations?.[target] || 0);
  if (ledger.finalized || ledger.remaining <= 0) return { ok: false, reason: 'empty' };
  if (current >= 2) return { ok: false, reason: 'limit' };
  ledger.allocations = { plant: 0, egg: 0, outside: 0, ...(ledger.allocations || {}) };
  ledger.allocations[target] = current + 1;
  ledger.remaining -= 1;
  ledger.allocated += 1;
  const sourceEventIds = state.events.filter(event => event.localDate === dateKey && !event.tombstone).map(event => event.id);
  const allocation = { key: `seedAllocation:${dateKey}:${ledger.allocated}`, id: `seed-allocation-${dateKey}-${ledger.allocated}`, type: 'seedAllocation', localDate: dateKey, target, ordinal: ledger.allocated, sourceEventIds, ruleVersion: RULE_VERSION };
  upsertRecord(state, allocation);
  if (target === 'plant') {
    state.world.plantStage = normalizePlantStage(state.world.plantStage);
    const fromState = state.world.plantStage;
    const toState = nextStage(fromState, PLANT_STAGES);
    if (toState !== fromState) {
      state.world.plantStage = toState;
      upsertRecord(state, { key: `worldchange:nurture:${dateKey}:plant:${ledger.allocated}`, type: 'worldChange', changeId: `change-nurture-${dateKey}-plant-${ledger.allocated}`, changeType: 'plantStage', assetTarget: 'roomPlant', fromState, toState, sourceEventIds, ruleVersion: RULE_VERSION, eligibleAt: new Date().toISOString(), status: 'revealed', revealedAt: new Date().toISOString(), revealContext: 'settlement', settlementId: getRecord(state, `settlement:${dateKey}`)?.settlementId || null });
    }
  }
  if (target === 'egg') state.world.eggStage = nextStage(normalizeEggStage(state.world.eggStage), EGG_STAGES);
  if (target === 'outside') { state.world.outsideGrowth = Number(state.world.outsideGrowth || 0) + 1; state.world.outsideStage = state.world.outsideGrowth > 0 ? 'branch' : 'blank'; }
  state.world.lifeSeeds = Number(state.world.lifeSeeds || 0);
  state.world.seedJarStage = seedJarStageForBalance(state.world.lifeSeeds);
  state.world.changedAt = new Date().toISOString();
  return { ok: true, target, allocation, remaining: ledger.remaining, targetCount: ledger.allocations[target] };
}

export function finalizeLifeSeeds(state, dateKey) {
  const ledger = ensureDailySeeds(state, dateKey);
  if (!ledger.finalized) { state.world.lifeSeeds = Number(state.world.lifeSeeds || 0) + Number(ledger.remaining || 0); ledger.stored = Number(ledger.remaining || 0); ledger.remaining = 0; ledger.finalized = true; ledger.finalizedAt = new Date().toISOString(); }
  state.world.seedJarStage = seedJarStageForBalance(state.world.lifeSeeds);
  return ledger;
}

export function deriveAir(state, dateKey) { return smokeCount(state, dateKey) > 0 ? 'slightlyGrey' : 'clear'; }
export function deriveZhanzhan(state, dateKey, timeOfDay = 'day') {
  const checkin = currentCheckin(state, dateKey);
  if (currentSettlement(state, dateKey)) return 'settled';
  if (timeOfDay === 'morning') return 'morning';
  if (checkin && (checkin.energy <= 2 || checkin.bodyFeel <= 2)) return 'tired';
  return 'neutral';
}
export function deriveSmokeBeast(state, dateKey) {
  const encounter = currentEncounter(state);
  if (!encounter) return 'hidden';
  const last = lastSmokeEvent(state, dateKey);
  if (last && Date.now() - new Date(last.createdAt).getTime() < 9000) return 'eating';
  if (smokeCount(state, dateKey) >= 10) return 'full';
  return 'normal';
}

export function isMorning() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: 'numeric', hour12: false }).format(new Date()));
  return hour < 11;
}

export function createSmokeEvent(state, dateKey) {
  const now = new Date();
  const event = {
    id: createId('smoke'), clientEventId: createId('client'), userId: state.userId, type: 'smoke', localDate: dateKey,
    occurredAt: now.toISOString(), timezone: state.timezone, source: 'quickLog', createdAt: now.toISOString(), updatedAt: now.toISOString(),
    ruleVersion: RULE_VERSION, tombstone: false, syncStatus: 'pending'
  };
  state.events.push(event);
  return event;
}

export function createSmokeCorrection(state, targetEvent) {
  const now = new Date().toISOString();
  targetEvent.tombstone = true;
  targetEvent.updatedAt = now;
  const correction = {
    id: createId('correction'), clientEventId: createId('client'), userId: state.userId, type: 'smokeCorrection', targetEventId: targetEvent.id,
    localDate: targetEvent.localDate, occurredAt: now, timezone: state.timezone, source: 'undo', createdAt: now, updatedAt: now,
    ruleVersion: RULE_VERSION, tombstone: false, syncStatus: 'pending'
  };
  state.events.push(correction);
  return correction;
}

export function ensureFirstEncounter(state, triggerEvent) {
  const existing = currentEncounter(state);
  if (existing || state.world.firstSmokeEncountered) return null;
  const encounter = {
    key: 'encounter:smokeBeast', type: 'encounterRecord', encounterId: createId('encounter'), characterId: 'smokeBeast', relationshipStage: 'encounter',
    encounterType: 'first', triggerEventId: triggerEvent.id, occurredAt: triggerEvent.occurredAt, ruleVersion: RULE_VERSION
  };
  upsertRecord(state, encounter);
  state.world.firstSmokeEncountered = true;
  state.world.smokeBeastRelationship = 'encounter';
  state.world.changedAt = new Date().toISOString();
  return encounter;
}

export function ensureFocus(state, dateKey) { upsertRecord(state, currentFocus(state, dateKey)); }

export function createPlantChangeCandidate(state, dateKey, checkinId) {
  state.world.plantStage = normalizePlantStage(state.world.plantStage);
  if (state.world.plantStage !== 'stage_01') return null;
  const existing = state.records.find(record => record.type === 'worldChange' && record.assetTarget === 'roomPlant' && record.toState === 'stageB');
  if (existing) return existing;
  const sourceEventIds = [...activeSmokeEvents(state, dateKey).map(event => event.id), checkinId];
  const change = {
    key: `worldchange:plant:${dateKey}`, type: 'worldChange', changeId: createId('change'), changeType: 'plantStage', assetTarget: 'roomPlant',
    fromState: 'stage_01', toState: 'stage_02', sourceEventIds, ruleVersion: RULE_VERSION, eligibleAt: new Date().toISOString(), status: 'eligible',
    revealedAt: null, revealContext: 'settlement', settlementId: null, sliceTestRule: 'valid settled day + care evidence'
  };
  upsertRecord(state, change);
  return change;
}

export function approveChange(change, settlementId) {
  if (!change || change.status !== 'eligible') return change;
  change.status = 'approved'; change.settlementId = settlementId; change.updatedAt = new Date().toISOString(); return change;
}

export function revealChange(state, change, settlementId) {
  if (!change || !['approved', 'eligible'].includes(change.status)) return false;
  change.status = 'revealed'; change.revealedAt = new Date().toISOString(); change.revealContext = 'settlement'; change.settlementId = settlementId; change.updatedAt = new Date().toISOString();
  state.world.plantStage = change.toState;
  state.world.lastRevealedChangeId = change.changeId;
  state.world.changedAt = new Date().toISOString();
  return true;
}

export function settlementSummary(state, dateKey, settlementId) {
  const checkin = currentCheckin(state, dateKey);
  const active = activeSmokeEvents(state, dateKey);
  const focus = currentFocus(state, dateKey);
  return { smokeCount: active.length, energy: checkin?.energy ?? null, food: checkin?.food ?? null, oneThingStatus: active.length <= (focus.target || 10) ? '在目标里' : '今天有点猛', lifeSeeds: dailySeedReward(state, dateKey), dateKey, settlementId };
}
