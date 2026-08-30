import { createStore, getRecord, upsertRecord } from './v4/store.js';
import {
  TIMEZONE, RULE_VERSION, activeSmokeEvents, currentCheckin, currentEncounter, currentFocus, currentSeedLedger,
  currentSettlement, dateLabel, deriveAir, deriveSmokeBeast, deriveZhanzhan, ensureDailySeeds,
  ensureFirstEncounter, ensureFocus, createLifeRecord, createSmokeCorrection, createSmokeEvent,
  finalizeLifeSeeds, hasLifeRecord, localDateKey, localTime, pendingCount, settlementSummary,
  allocateLifeSeed, smokeCount
} from './v4/domain.js';
import { layoutModeForViewport } from './v4/layout.js';

const store = createStore(TIMEZONE);
const shell = document.querySelector('#app-shell');
const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const sheet = document.querySelector('#bottom-sheet');
const backdrop = document.querySelector('#sheet-backdrop');
const syncDot = document.querySelector('#sync-dot');
const syncState = document.querySelector('#sync-state');
const CORE_ASSET_ROOT = './assets/v4/slice01/ALIVE_V4_SLICE01_PRODUCTION_ASSETS';
const FULL_ASSET_ROOT = './assets/v4/full-mvp';
const asset = file => `${CORE_ASSET_ROOT}/${file}`;
const mvpAsset = (batch, file) => `${FULL_ASSET_ROOT}/${batch}/${file}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));

let state;
let currentDate = localDateKey(new Date(), TIMEZONE);
let ui = { showSettlement:false, sheet:null, draft:null, undoTargetId:null, popMessage:'', beastTap:false, beastEatingUntil:0, roomFeedback:'', nurtureFx:null, modeOverride:null, dev:new URLSearchParams(location.search).has('dev') };
let toastTimer;
let undoTimer;
let beastTimer;
let smokeTimer;

function setState(next) {
  state = next;
  applyLayoutMode(ui.modeOverride || layoutModeForViewport(window.innerWidth, window.innerHeight));
  state.world.airState = deriveAir(state, currentDate);
  const pending = pendingCount(state);
  if (syncDot) syncDot.dataset.status = pending ? 'pending' : 'saved';
  if (syncState) { syncState.textContent = pending ? '待同步' : '本机已记'; syncState.dataset.status = pending ? 'pending' : 'saved'; }
}
function applyLayoutMode(mode) {
  if (!state || !['folded','unfolded'].includes(mode)) return false;
  const changed = state.deviceMode !== mode || shell.dataset.mode !== mode || shell.dataset.layoutMode !== mode;
  state.deviceMode = mode;
  shell.dataset.mode = mode;
  shell.dataset.layoutMode = mode;
  return changed;
}
function updateLayoutMode() {
  if (!state || ui.modeOverride) return false;
  const viewport = window.visualViewport;
  const changed = applyLayoutMode(layoutModeForViewport(viewport?.width || window.innerWidth, viewport?.height || window.innerHeight));
  if (changed) render();
  return changed;
}
const todayCheckin = () => currentCheckin(state, currentDate);
const todaySettlement = () => currentSettlement(state, currentDate);
const todayFocus = () => currentFocus(state, currentDate);
const todaySmoke = () => smokeCount(state, currentDate);
function timeOfDay() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone:TIMEZONE, hour:'numeric', hour12:false }).format(new Date()));
  if (hour < 11) return 'morning';
  if (hour >= 21) return 'night';
  return 'day';
}
function copyForState() {
  const checkin = todayCheckin();
  if (ui.popMessage) return ui.popMessage;
  if (todaySettlement()) return '昨晚的变化还在。';
  if (checkin && (checkin.energy <= 2 || checkin.bodyFeel <= 2)) return '今天有点累，先别急着翻盘。';
  if (todaySmoke() > Number(todayFocus().target || 10)) return '今天有点猛。明天先救一件。';
  return timeOfDay() === 'morning' ? '先住下吧。' : '回来啦？';
}
function dayRecords(type) { return state.records.filter(record => record.type === type && record.localDate === currentDate && !record.tombstone); }
function roomImg(file, className, alt, extra = '', anchor) {
  const anchorKey = anchor || className.replace(/^room-/, '').replaceAll('-', '_');
  return `<div class="room-anchor anchor-${anchorKey.replace('_','-')}" data-room-anchor="${anchorKey}"><img class="room-asset ${className} ${extra}" src="${file}" alt="${esc(alt)}" draggable="false" /></div>`;
}
function fullStageAsset(prefix, stage) {
  const index = Math.max(1, Math.min(6, Number(String(stage || 'stage_01').replace(/\D/g, '') || 1)));
  return mvpAsset('batch01', `${prefix}_${String(index).padStart(2, '0')}${prefix === 'egg_stage' ? ({1:'_still',2:'_wiggle',3:'_hairline_crack',4:'_crack',5:'_almost',6:'_mystery'}[index]) : ''}.png`);
}
function plantAsset(stage) { return fullStageAsset('plant_stage', stage); }
function eggAsset(stage) {
  // Stage 01 uses the approved transparent production Egg. Later stages keep
  // the Phase 1 growth library, while the selector remains the sole authority.
  const index = Number(String(stage || 'stage_01').replace(/\D/g, '') || 1);
  return index <= 1 ? asset('world/egg_still.png') : fullStageAsset('egg_stage', stage);
}
function jarAsset(balance) {
  if (balance <= 0) return 'seed_jar_empty.png';
  if (balance <= 2) return 'seed_jar_low.png';
  if (balance <= 5) return 'seed_jar_medium.png';
  if (balance <= 8) return 'seed_jar_almost_full.png';
  return 'seed_jar_full.png';
}
function stableSmokeState() { return todaySmoke() >= 10 ? 'full' : 'normal'; }
function smokeVisualState() { return ui.beastEatingUntil > Date.now() ? 'eating' : stableSmokeState(); }
function zhanzhanVisualState() {
  const checkin = todayCheckin();
  if (ui.nurtureFx) return 'planting_seed';
  if (todaySettlement()) return 'sitting';
  if (checkin && (checkin.energy <= 2 || checkin.bodyFeel <= 2)) return 'hug_knees';
  if (dayRecords('waterEvent').length) return 'drinking_water';
  if (timeOfDay() === 'morning') return 'sitting';
  if (timeOfDay() === 'night') return 'cozy_evening';
  return 'sitting_floor';
}
function residentRecords() {
  const residents = [];
  const latest = type => dayRecords(type).sort((a,b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || ''))).at(-1);
  if (latest('drinkDaily')) residents.push({ id:'liverBoy', src:mvpAsset('batch02','liver_normal.png'), alt:'肝肝', cls:'resident-liver' });
  if (latest('moveEvent')) residents.push({ id:'muscleBoy', src:mvpAsset('batch02','muscle_normal.png'), alt:'肌肉仔', cls:'resident-muscle' });
  if (latest('sleepLog')) residents.push({ id:'moonBoy', src:mvpAsset('batch02','moon_normal.png'), alt:'月亮仔', cls:'resident-moon' });
  if (latest('waterEvent')) residents.push({ id:'waterBoy', src:mvpAsset('batch02','water_normal.png'), alt:'水滴仔', cls:'resident-water' });
  // Two supporting slots are available. Smoke Beast occupies the right slot
  // after the first encounter, so the room never becomes character-crowded.
  const slotCount = currentEncounter(state) ? 1 : 2;
  return residents.slice(0, slotCount).map((resident, index) => ({ ...resident, anchor:index === 0 ? 'resident_left' : 'resident_right' }));
}
function roomSeedBalance() {
  const ledger = currentSeedLedger(state, currentDate);
  return Number(state.world.lifeSeeds || 0) + Number(ledger?.remaining || 0);
}
function renderResidents() {
  return residentRecords().map(resident => `<button class="room-anchor room-resident ${resident.cls} anchor-${resident.anchor.replace('_','-')}" data-room-anchor="${resident.anchor}" data-action="tap-resident" data-resident="${resident.id}" aria-label="${resident.alt}"><img class="resident-asset" src="${resident.src}" alt="${resident.alt}" draggable="false" /></button>`).join('');
}
function renderRoom() {
  const air = state.world.airState === 'slightlyGrey' ? ' grey-air' : '';
  const plant = plantAsset(state.world.plantStage);
  const egg = eggAsset(state.world.eggStage);
  const zhanzhan = zhanzhanVisualState();
  const smokeState = smokeVisualState();
  const encounter = Boolean(currentEncounter(state));
  const balance = roomSeedBalance();
  // Both window states live in the approved Slice 01 production asset set.
  // Do not request the non-existent full-mvp/batch01/window_early.png path.
  const windowFile = state.world.outsideStage !== 'blank' ? asset('world/window_early.png') : asset('room/room_window.png');
  const nurtureFx = ui.nurtureFx ? `<div class="nurture-fx" aria-hidden="true"><img src="${mvpAsset('batch01', ui.nurtureFx)}" alt="" /></div>` : '';
  return `<section class="room-scene${air}" data-room-scene="room-zero" aria-label="Room Zero 小房间">
    <div class="room-wall"></div><div class="room-floor"></div>
    <div class="room-label"><span>ROOM ZERO</span></div>
    <div class="room-note"><span>${esc(copyForState())}</span><img src="${asset('ui/ui_tape_yellow.png')}" alt="" aria-hidden="true" /></div>
    ${roomImg(windowFile, 'room-window', '窗户与窗外', '', 'window')}
    ${roomImg(asset('room/room_lamp.png'), 'room-lamp', '吊灯', '', 'lamp')}
    ${roomImg(asset('room/room_bed.png'), 'room-bed', '红橙色床', '', 'bed')}
    ${roomImg(asset('room/room_rug.png'), 'room-rug', '黄色地毯', '', 'rug')}
    ${roomImg(asset('room/room_table.png'), 'room-table', '小桌', '', 'table')}
    ${roomImg(asset('room/room_stool.png'), 'room-stool', '小凳', '', 'stool')}
    ${roomImg(asset('room/room_cup.png'), 'room-cup', '有红心的杯子', '', 'cup')}
    ${roomImg(asset('room/room_slippers.png'), 'room-slippers', '拖鞋', '', 'slippers')}
    ${roomImg(plant, 'room-plant', '房间植物', '', 'plant')}
    ${roomImg(egg, 'room-egg', '神秘蛋，安静地待着', '', 'egg')}
    ${roomImg(mvpAsset('batch02a', `zhanzhan_${zhanzhan}.png`), 'room-zhanzhan', '詹詹', '', 'protagonist')}
    <button class="room-anchor room-seed-jar anchor-seed-jar" data-room-anchor="seed_jar" data-action="tap-jar" aria-label="种子罐"><img src="${mvpAsset('batch01', jarAsset(balance))}" alt="种子罐" /></button>
    ${renderResidents()}
    ${encounter ? `<button class="room-anchor room-smoke-beast anchor-resident-right state-${smokeState}${ui.beastTap ? ' tap-react' : ''}" data-room-anchor="resident_right" data-action="tap-beast" aria-label="烟雾兽，点击看看"><img src="${asset(`characters/smoke-beast/smoke_beast_${smokeState}.png`)}" alt="烟雾兽" draggable="false" />${ui.popMessage ? `<span class="dialogue"><img src="${asset('ui/ui_speech_bubble.png')}" alt="" aria-hidden="true" /><b>${esc(ui.popMessage)}</b></span>` : ''}</button>` : ''}
    ${nurtureFx}
    ${ui.roomFeedback ? `<div class="room-feedback" role="status">${esc(ui.roomFeedback)}</div>` : ''}
  </section>`;
}
function renderMorningSummary() {
  const previous = state.records.filter(record => record.type === 'settlement' && record.localDate !== currentDate).sort((a,b) => String(a.localDate).localeCompare(String(b.localDate))).at(-1);
  if (!previous) return `<div class="morning-summary empty"><span class="mini-label">第一次来</span><strong>先住下吧。</strong><small>房间还很简单，正好。</small></div>`;
  const summary = previous.summary || {};
  return `<div class="morning-summary"><span class="mini-label">昨晚</span><strong>${esc(previous.localDate)}</strong><small>抽烟 ${summary.smokeCount ?? 0} 支 · ${summary.energy ? `精力 ${summary.energy}/5` : '还没填身体状态'}</small></div>`;
}
function renderFocus() {
  const target = Number(todayFocus().target || 10);
  const progress = Math.min(100, target ? (todaySmoke() / target) * 100 : 0);
  return `<section class="focus-note" aria-label="今天一件事"><div class="note-heading"><span>今天，先养这一件。</span><img src="${asset('ui/ui_tape_red.png')}" alt="" aria-hidden="true" /></div><button class="focus-target" data-action="edit-focus" aria-label="调整今天目标：不超过 ${target} 支"><img src="${asset('ui/ui_smoke_icon.png')}" alt="" aria-hidden="true" /><div class="focus-target-body"><strong>不超过 ${target} 支</strong><b>${todaySmoke()}支</b><small>目标 ≤${target}支</small><i class="focus-meter"><em style="width:${progress}%"></em></i></div></button></section>`;
}
function renderSmokeAction() { return `<div class="smoke-action-wrap"><button class="smoke-primary" data-action="smoke" aria-label="抽了一支，记录一支烟"><b>＋ 抽了一支</b></button></div>`; }
function renderQuickLog() {
  const icon = file => `<span class="quick-icon">${file ? `<img src="${file}" alt="" aria-hidden="true" />` : '＋'}</span>`;
  return `<section class="quick-log" aria-label="快速记录"><div class="section-kicker"><span>快速记录</span><small>输入保持很小</small></div><div class="quick-buttons">
    <button class="quick-button quick-button-smoke" data-action="smoke">${icon(asset('ui/ui_smoke_icon.png'))}<b>抽烟</b><small>记录一支</small></button>
    <button class="quick-button quick-button-drink" data-action="simple-log" data-log-type="drinkDaily">${icon(null)}<b>喝酒</b><small>记一杯</small></button>
    <button class="quick-button quick-button-move" data-action="simple-log" data-log-type="moveEvent">${icon(null)}<b>运动</b><small>记一下</small></button>
    <button class="quick-button quick-button-other muted" data-action="other-log">${icon(null)}<b>其它</b><small>更多记录</small></button>
  </div></section>`;
}
function renderStatus() {
  const target = Number(todayFocus().target || 10);
  const drink = dayRecords('drinkDaily').length ? '已记' : 'Dry';
  const move = dayRecords('moveEvent').reduce((total, record) => total + Number(record.durationMinutes || 0), 0);
  const sleep = dayRecords('sleepLog').length ? '已记' : '—';
  const water = dayRecords('waterEvent').length;
  return `<section class="today-state" aria-label="今日状态"><div class="state-title">今日状态</div><div class="state-rows">
    <div class="state-row"><img src="${asset('ui/ui_smoke_icon.png')}" alt="" aria-hidden="true" /><span>抽烟</span><strong>${todaySmoke()} / ${target} 支</strong></div>
    <div class="state-row"><span class="state-mark">酒</span><span>喝酒</span><strong>${drink}</strong></div>
    <div class="state-row"><span class="state-mark">动</span><span>运动</span><strong>${move ? `${move} min` : '—'}</strong></div>
    <div class="state-row"><span class="state-mark">眠</span><span>睡眠</span><strong>${sleep}</strong></div>
    <div class="state-row"><span class="state-mark">水</span><span>喝水</span><strong>${water} / 8 杯</strong></div>
  </div></section>`;
}
function renderMood() { const checkin = todayCheckin(); const mood = checkin ? (checkin.energy >= 4 ? 'good' : checkin.energy <= 2 ? 'rough' : 'okay') : 'unset'; return `<button class="mood-entry ${mood}" data-action="${checkin ? 'show-settlement' : 'checkin'}"><span>今天怎么样？</span><div class="mood-options"><b>好</b><b>一般</b><b>不好</b></div><small>${checkin ? (mood === 'good' ? '还不错' : mood === 'rough' ? '有点累' : '还行') : '晚上花 10 秒记一下'}</small><i>→</i></button>`; }
function renderGameNav() { return `<nav class="game-nav" aria-label="游戏导航"><button class="active" data-action="home"><span>⌂</span><b>房间</b></button><button data-action="not-ready"><span>⌕</span><b>发现</b></button><button data-action="not-ready"><span>▱</span><b>故事</b></button><button data-action="not-ready"><span>○</span><b>我的</b></button></nav>`; }
function renderDevTools() { return `<section class="dev-tools"><span>DEV ONLY · ${esc(currentDate)}</span><button data-action="set-mode" data-mode="folded">折叠测试</button><button data-action="set-mode" data-mode="unfolded">展开测试</button><button data-action="reset">清空 Slice 01 数据</button><button data-action="seed-encounter">模拟烟雾兽已遇见</button><button data-action="next-day">模拟下一天</button><small>仅在地址带 ?dev=1 时出现；只操作当前本机演示数据。</small></section>`; }
function renderToday() {
  const unfolded = state.deviceMode === 'unfolded';
  return `<section class="game-screen"><div class="game-layout"><div class="game-world"><div class="world-stage-wrap">${renderRoom()}</div></div><aside class="game-hud"><div class="hud-status">${renderStatus()}</div>${renderMood()}</aside></div>${unfolded ? '' : `<section class="game-focus">${renderFocus()}</section>`}<section class="game-action-row">${unfolded ? renderQuickLog() : `${renderSmokeAction()}${renderQuickLog()}`}</section>${unfolded ? renderGameNav() : ''}${ui.dev ? renderDevTools() : ''}</section>`;
}
function renderNurture() {
  const ledger = currentSeedLedger(state, currentDate);
  const available = Number(ledger?.remaining || 0);
  const earned = Number(ledger?.earned || 0);
  const target = (id, label, icon) => `<button class="nurture-target" data-action="nurture" data-target="${id}" ${available <= 0 ? 'disabled' : ''}><img src="${mvpAsset('batch01', icon)}" alt="" /><span>${label}</span><small>${Number(ledger?.allocations?.[id] || 0)} 颗</small></button>`;
  return `<section class="nurture-panel"><div class="nurture-heading"><span>今天，你养回来了一些。</span><b>${available} / ${earned} 颗</b><img src="${mvpAsset('batch01','seed_ready.png')}" alt="还有种子" /></div><p class="nurture-copy">一颗一颗来。今天想养哪里？</p><div class="nurture-targets">${target('plant','植物','plant_feedback.png')}${target('egg','蛋','egg_feedback.png')}${target('outside','窗外','outside_feedback.png')}</div><div class="nurture-hint">${available ? '点一下，种子就过去了。' : '今天先这样，剩下的会住进种子罐。'}</div><button class="secondary-button nurture-finish" data-action="finish-nurture">先这样，回到房间 →</button></section>`;
}
function renderSettlement() {
  const settlement = todaySettlement();
  const summary = settlement?.summary || settlementSummary(state, currentDate, settlement?.settlementId);
  const ledger = currentSeedLedger(state, currentDate);
  const change = state.records.find(record => record.type === 'worldChange' && record.assetTarget === 'roomPlant' && record.localDate === currentDate && record.status === 'revealed');
  return `<section class="settlement-view"><div class="settlement-head"><span class="paper-tag red">今天发生了</span><h1>今天，<br /><em>养回来一点。</em></h1></div><div class="settlement-room"><div class="settlement-room-title">ROOM ZERO</div>${renderRoom()}</div><div class="settlement-grid"><div class="summary-card settlement-note"><span class="mini-label">现实记下了</span><div class="settlement-facts"><div class="settlement-fact"><b>🚬</b><span>抽烟</span><strong>${summary.smokeCount ?? 0}支</strong></div><div class="settlement-fact"><b>✦</b><span>精力</span><strong>${summary.energy ? `${summary.energy}/5` : '—'}</strong></div><div class="settlement-fact"><b>○</b><span>吃得</span><strong>${esc(summary.food || '—')}</strong></div><div class="settlement-fact"><b>⌁</b><span>这一件</span><strong>${esc(summary.oneThingStatus || '已记')}</strong></div></div></div><div class="change-card"><span class="mini-label">世界记住了</span><div class="change-visual"><img src="${plantAsset(state.world.plantStage)}" alt="${change ? '植物已成长' : '房间植物'}" /><span>${change ? '它没有很大声，但确实长出来了。' : '今天的种子，等你来安排。'}</span></div><p>成长发生在房间里，不靠奖励掉落。</p></div></div>${renderNurture()}<div class="settlement-footer"><span>今天，又养回来一些。</span><strong>${Number(ledger?.remaining || 0) ? '还有种子在等你。' : '今天先这样。'}</strong></div><button class="primary-button" data-action="finish-nurture">回到 Room Zero <span>→</span></button></section>`;
}
function render() { shell.dataset.mode = state.deviceMode; shell.classList.toggle('settled', ui.showSettlement); app.innerHTML = ui.showSettlement ? renderSettlement() : renderToday(); renderSheet(); if (ui.showSettlement) window.scrollTo(0,0); }
function showToast(message, action = null) { clearTimeout(toastTimer); toast.innerHTML = `<span>${esc(message)}</span>${action ? `<button data-action="${action}" aria-label="撤销这条记录">撤销</button>` : ''}`; toast.classList.add('show'); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800); }
function openCheckin() { const c = todayCheckin(); ui.sheet = 'checkin'; ui.draft = { energy:c?.energy || 3, skin:c?.skin || 3, puffiness:c?.puffiness || 3, bodyFeel:c?.bodyFeel || 3, food:c?.food || '正常' }; renderSheet(); }
function openOtherLog() { ui.sheet = 'other'; ui.draft = null; renderSheet(); }
function restoreScrollState() { document.documentElement.classList.remove('sheet-open'); document.body.classList.remove('sheet-open'); for (const node of [document.documentElement, document.body]) { node.style.removeProperty('overflow'); node.style.removeProperty('position'); node.style.removeProperty('touch-action'); } }
function closeSheet() { ui.sheet = null; ui.draft = null; sheet.hidden = true; backdrop.classList.remove('show'); restoreScrollState(); }
function renderSheet() {
  if (!ui.sheet) { sheet.hidden = true; backdrop.classList.remove('show'); restoreScrollState(); return; }
  if (ui.sheet === 'focus') sheet.innerHTML = `<button class="sheet-close" data-action="close-sheet" aria-label="关闭">×</button><span class="sheet-kicker">TODAY · ONE THING</span><h2 id="sheet-title">今天先养哪一个？</h2><p class="sheet-copy">Slice 01 先专注烟雾兽。你可以调整目标，但它不会替你生活。</p><div class="target-stepper"><button data-action="focus-minus">−</button><strong>${todayFocus().target} <small>支</small></strong><button data-action="focus-plus">＋</button></div><button class="primary-button" data-action="close-sheet">就这样 <span>→</span></button>`;
  else if (ui.sheet === 'other') sheet.innerHTML = `<button class="sheet-close" data-action="close-sheet" aria-label="关闭">×</button><span class="sheet-kicker">QUICK LOG · 轻轻记一下</span><h2 id="sheet-title">还想记点别的？</h2><p class="sheet-copy">不用完整记录，今天有发生就好。</p><div class="other-log-grid"><button data-action="simple-log" data-log-type="waterEvent">💧 喝水了</button><button data-action="simple-log" data-log-type="drinkDaily">🍷 喝酒</button><button data-action="simple-log" data-log-type="moveEvent">🏃 动了一下</button><button data-action="simple-log" data-log-type="sleepLog">🌙 准备睡</button></div><button class="secondary-button" data-action="checkin">今晚记身体状态</button>`;
  else { const d = ui.draft; const scale = (key,label) => `<div class="scale-row"><span>${label}</span><div>${[1,2,3,4,5].map(value => `<button class="scale-choice ${d[key] === value ? 'selected' : ''}" data-checkin-key="${key}" data-checkin-value="${value}">${value}</button>`).join('')}</div></div>`; sheet.innerHTML = `<button class="sheet-close" data-action="close-sheet" aria-label="关闭">×</button><span class="sheet-kicker">EVENING · 10 秒</span><h2 id="sheet-title">今天怎么样？</h2><p class="sheet-copy">不用想太久，凭第一感觉。</p>${scale('energy','精力')}${scale('skin','皮肤')}${scale('puffiness','浮肿')}${scale('bodyFeel','身体感觉')}<div class="food-row"><span>今天吃得</span><div>${['清爽','正常','放纵'].map(value => `<button class="food-choice ${d.food === value ? 'selected' : ''}" data-checkin-key="food" data-checkin-value="${value}">${value}</button>`).join('')}</div></div><button class="primary-button" data-action="submit-checkin">完成今天 <span>→</span></button>`; }
  sheet.hidden = false; backdrop.classList.add('show');
}
async function handleSmoke() {
  let created; let encountered = false;
  const next = await store.update(draft => { ensureFocus(draft,currentDate); created = createSmokeEvent(draft,currentDate); encountered = Boolean(ensureFirstEncounter(draft,created)); draft.world.airState = deriveAir(draft,currentDate); });
  setState(next); ui.undoTargetId = created.id; ui.popMessage = encountered ? '你叫我？' : ''; ui.beastEatingUntil = Date.now() + 1250; clearTimeout(smokeTimer); smokeTimer = setTimeout(() => { ui.beastEatingUntil = 0; ui.popMessage = ''; render(); }, 1350); clearTimeout(undoTimer); undoTimer = setTimeout(() => { ui.undoTargetId = null; render(); }, 5000); render(); showToast('记下了。', 'undo');
}
async function handleUndo() { const target = state.events.find(event => event.id === ui.undoTargetId && event.type === 'smoke' && !event.tombstone); if (!target) { ui.undoTargetId = null; render(); return; } const next = await store.update(draft => { createSmokeCorrection(draft,target); draft.world.airState = deriveAir(draft,currentDate); }); setState(next); ui.undoTargetId = null; ui.beastEatingUntil = 0; ui.popMessage = ''; clearTimeout(smokeTimer); render(); showToast('撤销了。这条记录已经被纠正。'); }
async function submitCheckin() {
  const draft = ui.draft; let settlementId;
  const next = await store.update(nextState => { const checkinId = `checkin-${currentDate}`; upsertRecord(nextState,{ key:`checkin:${currentDate}`, type:'bodyCheckIn', id:checkinId, localDate:currentDate, ...draft, ruleVersion:RULE_VERSION }); settlementId = getRecord(nextState,`settlement:${currentDate}`)?.settlementId || `settlement-${currentDate}`; const ledger = ensureDailySeeds(nextState,currentDate); const previous = getRecord(nextState,`settlement:${currentDate}`); const summary = settlementSummary(nextState,currentDate,settlementId); upsertRecord(nextState,{ key:`settlement:${currentDate}`, type:'settlement', settlementId, localDate:currentDate, summary:{...summary,lifeSeeds:ledger.earned}, checkInId:checkinId, revealedChangeIds:previous?.revealedChangeIds || [], remainingEligibleChangeIds:previous?.remainingEligibleChangeIds || [], closingCopyState:'todayNurtured', ruleVersion:RULE_VERSION }); nextState.world.lastSettlementId = settlementId; });
  setState(next); closeSheet(); ui.showSettlement = true; ui.popMessage = ''; render(); showToast('结算好了。还有种子在等你。');
}
async function handleSimpleLog(type) { const next = await store.update(draft => { if (type === 'waterEvent' || !hasLifeRecord(draft,currentDate,type)) createLifeRecord(draft,currentDate,type,type === 'moveEvent' ? { durationMinutes:30 } : {}); }); setState(next); closeSheet(); const reaction = { waterEvent:['drinking_water','喝点水。'], drinkDaily:['speechless','收到。'], moveEvent:['happy','有活？！'], sleepLog:['cozy_evening','晚安。'] }[type]; ui.popMessage = reaction?.[1] || ''; render(); showToast('记下了。'); }
async function handleNurture(target) { let result; const next = await store.update(draft => { result = allocateLifeSeed(draft,currentDate,target); }); setState(next); if (!result.ok) { showToast(result.reason === 'limit' ? '这个地方今天先到这里。' : '种子已经用完啦。'); render(); return; } ui.roomFeedback = target === 'plant' ? '小芽接住了。' : target === 'egg' ? '蛋听见了。' : '窗外有一点动静。'; ui.nurtureFx = target === 'plant' ? 'plant_absorb.png' : target === 'egg' ? 'egg_absorb_feedback.png' : 'outside_absorb.png'; render(); showToast(target === 'plant' ? '植物长了一点。' : target === 'egg' ? '蛋轻轻记住了。' : '窗外多了一点东西。'); setTimeout(() => { ui.roomFeedback = ''; ui.nurtureFx = null; render(); }, 1700); }
async function finishNurture() { const next = await store.update(draft => finalizeLifeSeeds(draft,currentDate)); setState(next); ui.showSettlement = false; render(); showToast('今天先这样。'); }
async function changeFocus(delta) { const focus = todayFocus(); const target = Math.max(1,Math.min(30,Number(focus.target || 10) + delta)); const next = await store.update(draft => upsertRecord(draft,{...focus,key:`focus:${currentDate}`,target,userChanged:true,recommendedBy:focus.recommendedBy || 'smokeTrend',ruleVersion:RULE_VERSION})); setState(next); renderSheet(); render(); showToast(`今天目标：不超过 ${target} 支`); }
async function resetData() { if (!confirm('清空本机 Slice 01 演示数据？')) return; const fresh = await store.update(next => { next.events=[]; next.records=[]; next.world={ roomStage:'room',plantStage:'stage_01',eggStage:'stage_01',outsideStage:'blank',plantGrowth:0,eggGrowth:0,outsideGrowth:0,lifeSeeds:0,seedJarStage:'empty',airState:'clear',smokeBeastRelationship:'unknown',firstSmokeEncountered:false,lastSettlementId:null,lastRevealedChangeId:null,changedAt:new Date().toISOString() }; }); setState(fresh); ui={...ui,showSettlement:false,sheet:null,draft:null,undoTargetId:null,popMessage:'',beastTap:false,beastEatingUntil:0,nurtureFx:null}; render(); showToast('Room Zero 清空了。重新住进来吧。'); }
async function seedEncounter() { const next = await store.update(draft => { draft.world.firstSmokeEncountered=true; draft.world.smokeBeastRelationship='encounter'; upsertRecord(draft,{key:'encounter:smokeBeast',type:'encounterRecord',encounterId:'dev-encounter',characterId:'smokeBeast',relationshipStage:'encounter',encounterType:'first',triggerEventId:'dev',occurredAt:new Date().toISOString(),ruleVersion:RULE_VERSION}); }); setState(next); render(); showToast('开发场景：烟雾兽已遇见。'); }
async function nextDay() { const base = new Date(`${currentDate}T12:00:00+08:00`); base.setDate(base.getDate()+1); currentDate = localDateKey(base,TIMEZONE); const next = await store.get(); setState(next); ui.showSettlement=false; render(); showToast(`现在是 ${dateLabel(currentDate)}。`); }

document.addEventListener('click', async event => {
  const mode = event.target.closest('[data-mode]')?.dataset.mode; if (mode && ui.dev) { ui.modeOverride=mode; applyLayoutMode(mode); render(); return; }
  const choice = event.target.closest('[data-checkin-key]'); if (choice && ui.draft) { const key=choice.dataset.checkinKey; ui.draft[key] = key === 'food' ? choice.dataset.checkinValue : Number(choice.dataset.checkinValue); renderSheet(); return; }
  const button = event.target.closest('[data-action]'); if (!button) return; const action=button.dataset.action;
  if (action === 'home' || action === 'close-settlement') { ui.showSettlement=false; render(); return; }
  if (action === 'show-settlement') { ui.showSettlement=true; render(); return; }
  if (action === 'smoke') { await handleSmoke(); return; }
  if (action === 'undo') { await handleUndo(); return; }
  if (action === 'checkin') { openCheckin(); return; }
  if (action === 'other-log') { openOtherLog(); return; }
  if (action === 'close-sheet') { closeSheet(); return; }
  if (action === 'submit-checkin') { await submitCheckin(); return; }
  if (action === 'edit-focus') { ui.sheet='focus'; renderSheet(); return; }
  if (action === 'focus-minus') { await changeFocus(-1); return; }
  if (action === 'focus-plus') { await changeFocus(1); return; }
  if (action === 'simple-log') { await handleSimpleLog(button.dataset.logType); return; }
  if (action === 'nurture') { await handleNurture(button.dataset.target); return; }
  if (action === 'finish-nurture') { await finishNurture(); return; }
  if (action === 'tap-jar') { showToast(roomSeedBalance() ? `种子罐里有 ${roomSeedBalance()} 颗。` : '还没有种子，慢慢来。'); return; }
  if (action === 'tap-resident') { showToast(button.dataset.resident === 'liverBoy' ? '肝肝今天有单。' : button.dataset.resident === 'muscleBoy' ? '肌肉仔热身中。' : button.dataset.resident === 'moonBoy' ? '月亮仔在窗外。' : '水滴仔晃了晃。'); return; }
  if (action === 'reset' && ui.dev) { await resetData(); return; }
  if (action === 'seed-encounter' && ui.dev) { await seedEncounter(); return; }
  if (action === 'next-day' && ui.dev) { await nextDay(); return; }
  if (action === 'tap-beast') { clearTimeout(beastTimer); ui.beastTap=true; ui.popMessage='今天先这样。'; render(); beastTimer=setTimeout(() => { ui.beastTap=false; ui.popMessage=''; render(); },1400); return; }
  if (action === 'not-ready') showToast('其它房间还在长。');
});
backdrop.addEventListener('click', closeSheet);
window.addEventListener('online', () => showToast('回来了，待同步记录会再试一次。'));
window.addEventListener('offline', () => showToast('先记着。网络回来再同步。'));

let layoutUpdateTimer;
function scheduleLayoutModeUpdate() {
  clearTimeout(layoutUpdateTimer);
  layoutUpdateTimer = setTimeout(() => { layoutUpdateTimer = null; updateLayoutMode(); }, 80);
}
window.addEventListener('resize', scheduleLayoutModeUpdate, { passive:true });
window.addEventListener('orientationchange', scheduleLayoutModeUpdate, { passive:true });
window.visualViewport?.addEventListener('resize', scheduleLayoutModeUpdate, { passive:true });

async function init() { const loaded=await store.init(); setState(loaded); await store.update(draft => ensureFocus(draft,currentDate)).then(setState); render(); window.setInterval(async () => { const nextDate=localDateKey(new Date(),TIMEZONE); if(nextDate !== currentDate){ currentDate=nextDate; const fresh=await store.get(); setState(fresh); ui.showSettlement=false; render(); showToast('新的一天。Room Zero 还在。'); } },30000); }
init();
