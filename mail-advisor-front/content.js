/**
 * content.js — Naver Mail 본문 → 상단 패널 미러링 + 전송 버튼 (라이트 버전)
 * - 결정 셀렉터: iframe 내부의 [aria-label="본문 내용"]
 * - 간단 폴링(120ms) + 가벼운 재바인딩
 * - 전송 시 "패널에 보이는 내용 그대로" POST 전송
 */

/* ===== 설정 ===== */
const IFRAME_HINT = 'iframe[tabindex="5"]';     // 네이버 편집 iframe 힌트
const PRIMARY_SELECTOR = '[aria-label="본문 내용"]';
const TEXT_MODE = 'text';                       // 'text' | 'html' (html은 리치텍스트 그대로 전송)
const POLL_MS = 120;
const ADVISE_URL = 'http://localhost:3000/advisor/test'; // 로컬 백엔드 수신 URL

/* ===== 상태 ===== */
let panelRoot = null, shadowHost = null, mirrorEl = null, statusEl = null, sendBtn = null;
let isOpen = false, editorEl = null, pollId = null, mo = null;

/* ===== 패널 생성 ===== */
async function ensurePanel() {
  if (panelRoot) return panelRoot;

  shadowHost = document.createElement('div');
  document.documentElement.appendChild(shadowHost);
  const shadow = shadowHost.attachShadow({ mode: 'open' });

  const html = await fetch(chrome.runtime.getURL('panel.html')).then(r => r.text());
  const wrap = document.createElement('div'); wrap.innerHTML = html;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('panel.css');

  shadow.appendChild(link);
  shadow.appendChild(wrap);

  panelRoot = shadow.querySelector('.nm-panel');
  mirrorEl  = shadow.querySelector('#nm-mirror');
  statusEl  = shadow.querySelector('#nm-status');
  sendBtn   = shadow.querySelector('#nm-send');

  shadow.querySelector('.nm-panel__close')?.addEventListener('click', () => togglePanel(false));
  sendBtn?.addEventListener('click', onSendClick);

  panelRoot.style.display = 'none';
  return panelRoot;
}

/* ===== 토글 ===== */
async function togglePanel(force) {
  await ensurePanel();
  const next = typeof force === 'boolean' ? force : !isOpen;
  isOpen = next;
  panelRoot.style.display = isOpen ? 'block' : 'none';
  if (isOpen) start(); else stop();
}

/* ===== 유틸 ===== */
function safeDoc(ifr) {
  try { return ifr?.contentDocument || ifr?.contentWindow?.document || null; }
  catch { return null; } // cross-origin 방지
}

function findEditor() {
  // 1) 힌트 iframe 먼저
  const hint = document.querySelector(IFRAME_HINT);
  const hintDoc = safeDoc(hint);
  const fromHint = hintDoc?.querySelector(PRIMARY_SELECTOR);
  if (fromHint) return fromHint;

  // 2) 모든 iframe 한 바퀴
  const ifrs = document.querySelectorAll('iframe');
  for (const f of ifrs) {
    const d = safeDoc(f);
    const el = d?.querySelector(PRIMARY_SELECTOR);
    if (el) return el;
  }

  // 3) 혹시 최상위 문서에 있을 수도
  return document.querySelector(PRIMARY_SELECTOR) || null;
}

/* 본문 스냅샷 → 패널 렌더 */
function snapshot(el) {
  if (!el) return '';
  if (TEXT_MODE === 'html') return el.innerHTML ?? '';
  const t1 = el.innerText ?? '';
  if (t1 && t1.trim()) return t1;

  // 보정: br → \n + 블록 경계 개행
  const clone = el.cloneNode(true);
  clone.querySelectorAll?.('br')?.forEach(br => br.replaceWith('\n'));
  const BLOCKS = new Set(['P','DIV','LI','UL','OL','H1','H2','H3','H4','H5','H6','TABLE','THEAD','TBODY','TR','TD','TH','PRE','BLOCKQUOTE']);
  const walker = document.createTreeWalker(clone, Node.ELEMENT_NODE);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (BLOCKS.has(n.tagName)) {
      n.prepend(document.createTextNode('\n'));
      n.append(document.createTextNode('\n'));
    }
  }
  return (clone.textContent ?? '').replace(/\n{3,}/g, '\n\n');
}

function render(text) {
  if (!mirrorEl) return;
  if (TEXT_MODE === 'html') mirrorEl.innerHTML = text;
  else mirrorEl.textContent = text;
}

/* ===== 전송: 미러에 보이는 내용 그대로 ===== */
function getMirrorPayload() {
  if (!mirrorEl) return '';
  return TEXT_MODE === 'html' ? (mirrorEl.innerHTML || '') : (mirrorEl.textContent || '').replace(/\s+$/,'');
}

async function onSendClick() {
  if (!sendBtn || !statusEl) return;

  const payload = {
    content: getMirrorPayload(),                       // 패널에서 직접 읽음
    contentType: TEXT_MODE === 'html' ? 'text/html' : 'text/plain',
    pageUrl: location.href,
    at: new Date().toISOString()
  };

  try {
    sendBtn.classList.add('loading');
    statusEl.textContent = '전송 중...';
    statusEl.classList.remove('ok','err');

    const res = await fetch(ADVISE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    statusEl.textContent = '완료';
    statusEl.classList.add('ok');
  } catch (e) {
    statusEl.textContent = `실패: ${e.message || e}`;
    statusEl.classList.add('err');
  } finally {
    sendBtn.classList.remove('loading');
  }
}

/* ===== 시작/정지 ===== */
function start() {
  editorEl = findEditor();
  let last = '';

  // 폴링
  stopPolling();
  pollId = setInterval(() => {
    // 에디터 교체/제거시 재탐색
    if (!editorEl || !editorEl.ownerDocument || !editorEl.ownerDocument.contains(editorEl)) {
      editorEl = findEditor();
      last = '';
    }
    if (!editorEl) return;

    const snap = snapshot(editorEl);
    if (snap !== last) { last = snap; render(snap); }
  }, POLL_MS);

  // 문서 전체 변화 감시(교체 대응)
  if (mo) mo.disconnect();
  mo = new MutationObserver(() => {
    if (!editorEl || !editorEl.ownerDocument || !editorEl.ownerDocument.contains(editorEl)) {
      editorEl = findEditor();
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
}

function stop() {
  stopPolling();
  if (mo) mo.disconnect(), mo = null;
  editorEl = null;
}

function stopPolling() {
  if (pollId) clearInterval(pollId), pollId = null;
}

/* ===== 액션 클릭 메시지 ===== */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'TOGGLE_PANEL') togglePanel();
});

/* ===== 초기 ===== */
ensurePanel();
