/**
 * content.js — Naver Mail 본문 → 상단 패널 미러링 + 전송 버튼 (라이트 버전)
 * - 결정 셀렉터: iframe 내부의 [aria-label="본문 내용"]
 * - 간단 폴링(120ms) + 가벼운 재바인딩
 * - 전송 시 "패널에 보이는 내용 그대로" POST 전송
**/

/* ===== 설정 ===== */
const IFRAME_HINT = 'iframe[tabindex="5"]';     // 네이버 편집 iframe 힌트
const PRIMARY_SELECTOR = '[aria-label="본문 내용"]';
const TEXT_MODE = 'text';                       // 'text' | 'html' (html은 리치텍스트 그대로 전송)
const POLL_MS = 120;
const ADVISE_URL = 'http://localhost:3000/advisor'; // 로컬 백엔드 수신 URL
const AUTH_URL = 'http://localhost:3000/auth'; // 인증 API URL
const PAYMENT_URL = 'http://localhost:3000/payment'; // 결제 API URL
const TOSS_CLIENT_KEY = 'test_ck_pP2YxJ4K87EvDLxvjwe9VRGZwXLO'; // 토스페이먼츠 테스트 클라이언트 키

/* ===== 상태 ===== */
let panelRoot = null, shadowHost = null, shadow = null, mirrorEl = null, statusEl = null, sendBtn = null, applyBtn = null;
let responseEl = null, adviceContentEl = null, tokenInfoEl = null;
let isOpen = false, editorEl = null, pollId = null, mo = null;
let currentAdvice = ''; // 현재 조언 내용 저장
let originalContent = ''; // 적용 전 원문 저장
let isApplied = false; // 적용 상태 추적

// 인증 상태 관리 - 로컬 스토리지에서 읽어오기
let accessToken = localStorage.getItem('accessToken') || '';
let refreshToken = localStorage.getItem('refreshToken') || '';
let isAuthenticated = false;
let tokenBalance = 0; // 보유 토큰

/* ===== 인증 관련 함수 ===== */
async function checkAuth() {
  if (!accessToken) {
    showLoginForm();
    return false;
  }
  
  // 토큰 유효성 검사 (간단한 체크)
  try {
    const response = await fetch(`${AUTH_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (response.ok) {
      const data = await response.json();
      accessToken = data.accessToken;
      localStorage.setItem('accessToken', accessToken);
      isAuthenticated = true;
      return true;
    }
  } catch (error) {
    console.error('인증 확인 실패:', error);
  }
  
  showLoginForm();
  return false;
}

function showLoginForm() {
  if (!panelRoot) return;
  
  // 인증 폼 표시
  const authForm = panelRoot.querySelector('#nm-auth-form');
  if (authForm) {
    authForm.style.display = 'block';
  }
}

async function login(username, password) {
  try {
    const response = await fetch(`${AUTH_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (response.ok) {
      const data = await response.json();
      accessToken = data.accessToken;
      refreshToken = data.refreshToken;
      tokenBalance = data.tokenAmount || 0;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      isAuthenticated = true;
      
      updateTokenBalance();
      
      // 인증 폼 숨기기
      const authForm = panelRoot.querySelector('#nm-auth-form');
      const mainContent = panelRoot.querySelector('#nm-main-content');
      if (authForm) authForm.style.display = 'none';
      if (mainContent) mainContent.style.display = 'block';
      
      return true;
    }
  } catch (error) {
    console.error('로그인 실패:', error);
  }
  return false;
}

async function signup(username, password) {
  try {
    const response = await fetch(`${AUTH_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (response.ok) {
      const data = await response.json();
      // 회원가입 성공 시 자동으로 로그인
      return await login(username, password);
    } else {
      const errorData = await response.json();
      throw new Error(errorData.message || '회원가입 실패');
    }
  } catch (error) {
    console.error('회원가입 실패:', error);
    throw error;
  }
}

/* ===== 패널 생성 ===== */
async function ensurePanel() {
  if (panelRoot) return panelRoot; // 패널이 이미 생성되어 있다면 기존 패널 반환

  // Shadow DOM을 위한 호스트 요소 생성 (CSS 격리를 위해)
  shadowHost = document.createElement('div');
  // 페이지 최상위에 호스트 요소 추가
  document.documentElement.appendChild(shadowHost);
  // Shadow DOM 생성 (open 모드로 외부에서 접근 가능)
  shadow = shadowHost.attachShadow({ mode: 'open' });

  // 패널 HTML 파일을 비동기로 가져와서 파싱
  const html = await fetch(chrome.runtime.getURL('panel.html')).then(r => r.text());
  // HTML 문자열을 DOM 요소로 변환하기 위한 래퍼 생성
  const wrap = document.createElement('div'); wrap.innerHTML = html;

  // CSS 파일 링크 요소 생성
  const link = document.createElement('link');
  link.rel = 'stylesheet'; // 스타일시트 타입 지정
  link.href = chrome.runtime.getURL('panel.css'); // CSS 파일 경로 설정

  // Shadow DOM에 CSS와 HTML 추가
  shadow.appendChild(link); // 스타일시트 먼저 추가
  shadow.appendChild(wrap); // HTML 내용 추가

  // 패널 내부 요소들 참조 저장
  panelRoot = shadow.querySelector('.nm-panel'); // 메인 패널 컨테이너
  mirrorEl  = shadow.querySelector('#nm-mirror'); // 본문 내용 미러링할 요소
  statusEl  = shadow.querySelector('.nm-status'); // 상태 메시지 표시 요소
  sendBtn   = shadow.querySelector('#nm-send'); // 전송 버튼
  applyBtn  = shadow.querySelector('#nm-apply'); // 적용 버튼
  responseEl = shadow.querySelector('#nm-response'); // 응답 영역
  adviceContentEl = shadow.querySelector('#nm-advice-content'); // 조언 내용
  tokenInfoEl = shadow.querySelector('#nm-token-info'); // 토큰 정보

  // 이벤트 리스너 등록
  shadow.querySelector('.nm-panel__close')?.addEventListener('click', () => togglePanel(false)); // 닫기 버튼 클릭 시 패널 닫기
  sendBtn?.addEventListener('click', onSendClick); // 전송 버튼 클릭 시 전송 함수 실행
  applyBtn?.addEventListener('click', onApplyClick); // 적용 버튼 클릭 시 적용 함수 실행
  
  // 로그인 버튼 이벤트
  const loginBtn = shadow.querySelector('#nm-login-btn');
  loginBtn?.addEventListener('click', async () => {
    const username = shadow.querySelector('#nm-username')?.value;
    const password = shadow.querySelector('#nm-password')?.value;
    const errorEl = shadow.querySelector('#nm-login-error');
    
    // 에러 메시지 숨기기
    if (errorEl) errorEl.style.display = 'none';
    
    if (!username || !password) {
      if (errorEl) {
        errorEl.textContent = '사용자명과 비밀번호를 입력해주세요.';
        errorEl.style.display = 'block';
      }
      return;
    }
    
    try {
      if (await login(username, password)) {
        if (statusEl) {
          statusEl.textContent = '로그인 성공!';
          statusEl.classList.remove('err');
          statusEl.classList.add('ok');
        }
        // 로그인 성공 시 메인 컨텐츠 표시
        const authForm = panelRoot.querySelector('#nm-auth-form');
        const mainContent = panelRoot.querySelector('#nm-main-content');
        if (authForm) authForm.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
      } else {
        if (errorEl) {
          errorEl.textContent = '사용자명 또는 비밀번호가 올바르지 않습니다.';
          errorEl.style.display = 'block';
        }
      }
    } catch (error) {
      if (errorEl) {
        errorEl.textContent = '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
        errorEl.style.display = 'block';
      }
    }
  });

  // 회원가입 버튼 이벤트
  const signupBtn = shadow.querySelector('#nm-signup-btn');
  signupBtn?.addEventListener('click', async () => {
    const username = shadow.querySelector('#nm-signup-username')?.value;
    const password = shadow.querySelector('#nm-signup-password')?.value;
    const confirmPassword = shadow.querySelector('#nm-signup-confirm')?.value;
    const errorEl = shadow.querySelector('#nm-signup-error');
    
    // 에러 메시지 숨기기
    if (errorEl) errorEl.style.display = 'none';
    
    if (!username || !password || !confirmPassword) {
      if (errorEl) {
        errorEl.textContent = '모든 필드를 입력해주세요.';
        errorEl.style.display = 'block';
      }
      return;
    }
    
    if (password !== confirmPassword) {
      if (errorEl) {
        errorEl.textContent = '비밀번호가 일치하지 않습니다.';
        errorEl.style.display = 'block';
      }
      return;
    }
    
    try {
      if (await signup(username, password)) {
        if (statusEl) {
          statusEl.textContent = '회원가입 및 로그인 성공!';
          statusEl.classList.remove('err');
          statusEl.classList.add('ok');
        }
        // 회원가입 성공 시 메인 컨텐츠 표시
        const authForm2 = panelRoot.querySelector('#nm-auth-form');
        const mainContent2 = panelRoot.querySelector('#nm-main-content');
        if (authForm2) authForm2.style.display = 'none';
        if (mainContent2) mainContent2.style.display = 'block';
      }
    } catch (error) {
      if (errorEl) {
        errorEl.textContent = error.message || '회원가입 실패';
        errorEl.style.display = 'block';
      }
    }
  });

  // 폼 전환 이벤트
  const showSignupBtn = shadow.querySelector('#nm-show-signup-btn');
  const showLoginBtn = shadow.querySelector('#nm-show-login-btn');
  const loginSection = shadow.querySelector('#nm-login-section');
  const signupSection = shadow.querySelector('#nm-signup-section');
  
  showSignupBtn?.addEventListener('click', () => {
    loginSection.style.display = 'none';
    signupSection.style.display = 'block';
  });
  
  showLoginBtn?.addEventListener('click', () => {
    signupSection.style.display = 'none';
    loginSection.style.display = 'block';
  });
  
  // 결제 버튼 이벤트
  const paymentBtn = shadow.querySelector('#nm-payment-btn');
  if (paymentBtn) {
    console.log('결제 버튼 발견:', paymentBtn);
    paymentBtn.addEventListener('click', async (e) => {
      console.log('결제 버튼 클릭됨!', e);
      // 금액 선택 모달 표시
      showAmountModal();
    });
  } else {
    console.error('결제 버튼을 찾을 수 없습니다!');
  }
  
  // 직접 입력 옵션 토글 이벤트
  setupCustomInputToggles(shadow);

  // 패널을 기본적으로 숨김 상태로 설정
  panelRoot.style.display = 'none';
  
  // 초기 상태: 로그인 폼만 표시, 메인 컨텐츠 숨김
  const authForm = panelRoot.querySelector('#nm-auth-form');
  const mainContent = panelRoot.querySelector('#nm-main-content');
  if (authForm) authForm.style.display = 'block';
  if (mainContent) mainContent.style.display = 'none';
  
  return panelRoot;
}

/* ===== 직접 입력 토글 설정 ===== */
function setupCustomInputToggles(shadow) {
  const togglePairs = [
    { type: 'nm-my-position-type', custom: 'nm-my-position-custom', count: 'nm-my-position-count', maxLength: 50 },
    { type: 'nm-my-job-type', custom: 'nm-my-job-custom', count: 'nm-my-job-count', maxLength: 50 },
    { type: 'nm-tone-level-type', custom: 'nm-tone-level-custom', count: 'nm-tone-level-count', maxLength: 50 },
    { type: 'nm-my-goal-type', custom: 'nm-my-goal-custom', count: 'nm-my-goal-count', maxLength: 100 },
    { type: 'nm-audience-type', custom: 'nm-audience-custom', count: 'nm-audience-count', maxLength: 50 }
  ];
  
  togglePairs.forEach(({ type, custom, count, maxLength }) => {
    const typeSelect = shadow.querySelector(`#${type}`);
    const customInput = shadow.querySelector(`#${custom}`);
    const countDisplay = shadow.querySelector(`#${count}`);
    
    if (typeSelect && customInput && countDisplay) {
      // 토글 이벤트
      typeSelect.addEventListener('change', () => {
        if (typeSelect.value === 'custom') {
          customInput.style.display = 'block';
          countDisplay.style.display = 'block';
          customInput.focus();
          updateCharCount(customInput, countDisplay, maxLength);
        } else {
          customInput.style.display = 'none';
          countDisplay.style.display = 'none';
          customInput.value = '';
        }
      });
      
      // 문자 카운터 이벤트 + 길이 제한
      customInput.addEventListener('input', (e) => {
        const currentValue = e.target.value;
        
        // 길이 제한 체크 (한글 포함)
        if (currentValue.length > maxLength) {
          e.target.value = currentValue.substring(0, maxLength);
        }
        
        updateCharCount(e.target, countDisplay, maxLength);
      });
      
      // 붙여넣기 이벤트도 처리
      customInput.addEventListener('paste', (e) => {
        setTimeout(() => {
          const currentValue = e.target.value;
          if (currentValue.length > maxLength) {
            e.target.value = currentValue.substring(0, maxLength);
          }
          updateCharCount(e.target, countDisplay, maxLength);
        }, 0);
      });
    }
  });
}

/* ===== 문자 카운터 업데이트 ===== */
function updateCharCount(input, countDisplay, maxLength) {
  const currentLength = input.value.length;
  const percentage = (currentLength / maxLength) * 100;
  
  countDisplay.textContent = `${currentLength}/${maxLength}`;
  
  // 색상 변경
  countDisplay.classList.remove('warning', 'danger');
  if (percentage >= 90) {
    countDisplay.classList.add('danger');
  } else if (percentage >= 75) {
    countDisplay.classList.add('warning');
  }
}

/* ===== 토글 ===== */
async function togglePanel(force) {
  await ensurePanel(); // 패널이 없으면 먼저 생성
  const next = typeof force === 'boolean' ? force : !isOpen; // 강제 값이 있으면 그대로, 없으면 현재 상태 반전
  isOpen = next; // 패널 열림/닫힘 상태 업데이트
  panelRoot.style.display = isOpen ? 'block' : 'none'; // 패널 표시/숨김 처리
  
  if (isOpen) {
    // 패널이 열릴 때 로그인 상태 확인
    if (accessToken && refreshToken) {
      // 이미 로그인된 상태면 사용자 정보 가져와서 메인 컨텐츠 표시
      try {
        await loadUserInfo();
        const authForm = panelRoot.querySelector('#nm-auth-form');
        const mainContent = panelRoot.querySelector('#nm-main-content');
        if (authForm) authForm.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
      } catch (error) {
        console.error('유저 정보 로드 실패:', error);
        // 로그인 폼 표시
        const authForm = panelRoot.querySelector('#nm-auth-form');
        const mainContent = panelRoot.querySelector('#nm-main-content');
        if (authForm) authForm.style.display = 'block';
        if (mainContent) mainContent.style.display = 'none';
      }
    } else {
      // 로그인되지 않은 상태면 로그인 폼 표시
      const authForm = panelRoot.querySelector('#nm-auth-form');
      const mainContent = panelRoot.querySelector('#nm-main-content');
      if (authForm) authForm.style.display = 'block';
      if (mainContent) mainContent.style.display = 'none';
    }
    start();
  } else {
    stop();
  }
}

/* ===== 유틸 ===== */
function safeDoc(ifr) {
  try { return ifr?.contentDocument || ifr?.contentWindow?.document || null; } // iframe 내부 문서에 안전하게 접근
  catch { return null; } // cross-origin 방지 (다른 도메인 iframe 접근 시 에러 방지)
}

function findEditor() {
  // 1) 힌트 iframe 먼저 (네이버 메일의 편집 iframe 우선 검색)
  const hint = document.querySelector(IFRAME_HINT); // tabindex="5"인 iframe 찾기
  const hintDoc = safeDoc(hint); // iframe 내부 문서 안전하게 가져오기
  const fromHint = hintDoc?.querySelector(PRIMARY_SELECTOR); // iframe 내에서 본문 에디터 찾기
  if (fromHint) return fromHint; // 찾았으면 바로 반환

  // 2) 모든 iframe 한 바퀴 (힌트에서 못 찾으면 모든 iframe 검색)
  const ifrs = document.querySelectorAll('iframe'); // 페이지의 모든 iframe 수집
  for (const f of ifrs) {
    const d = safeDoc(f); // 각 iframe의 문서 안전하게 가져오기
    const el = d?.querySelector(PRIMARY_SELECTOR); // iframe 내에서 본문 에디터 찾기
    if (el) return el; // 찾았으면 바로 반환
  }

  // 3) 혹시 최상위 문서에 있을 수도 (iframe 밖에 에디터가 있을 경우)
  return document.querySelector(PRIMARY_SELECTOR) || null; // 최상위 문서에서도 검색
}

/* 본문 스냅샷 → 패널 렌더 */
function snapshot(el) {
  if (!el) return '';
  if (TEXT_MODE === 'html') return el.innerHTML ?? '';
  
  // innerText 사용 (자동으로 블록 요소 간 줄바꿈 처리됨)
  const t1 = el.innerText ?? '';
  if (t1 && t1.trim()) {
    // 백엔드에서 포맷팅하므로 그대로 반환
    return t1;
  }

  // innerText가 없을 경우에만 수동 처리
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
  // 백엔드에서 포맷팅하므로 그대로 반환
  return clone.textContent ?? '';
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

/* ===== 사용자 입력 데이터 수집 ===== */
function getUserInputData() {
  if (!panelRoot) return {};
  
  // 옵션 선택과 직접 입력을 처리하는 헬퍼 함수
  const getValue = (typeId, customId) => {
    const typeSelect = panelRoot.querySelector(`#${typeId}`);
    const customInput = panelRoot.querySelector(`#${customId}`);
    
    if (typeSelect?.value === 'custom') {
      return customInput?.value || '';
    } else {
      return typeSelect?.value || '';
    }
  };
  
  return {
    my_position: getValue('nm-my-position-type', 'nm-my-position-custom'),
    my_job: getValue('nm-my-job-type', 'nm-my-job-custom'),
    tone_level: getValue('nm-tone-level-type', 'nm-tone-level-custom'),
    guide: panelRoot.querySelector('#nm-guide')?.value || '',
    task_type: panelRoot.querySelector('#nm-task-type')?.value || '',
    my_goal: getValue('nm-my-goal-type', 'nm-my-goal-custom'),
    text_length: panelRoot.querySelector('#nm-length')?.value || 'optimized',
    audience: getValue('nm-audience-type', 'nm-audience-custom')
  };
}

async function onSendClick() {
  if (!sendBtn) return;

  // 인증 확인
  if (!await checkAuth()) {
    showToast('로그인이 필요합니다.', 'error');
    return;
  }

  // 사용자 입력 데이터 수집
  const userInput = getUserInputData();
  
  const payload = {
    content: getMirrorPayload(),                       // 패널에서 직접 읽음
    contentType: TEXT_MODE === 'html' ? 'text/html' : 'text/plain',
    pageUrl: location.href,
    at: new Date().toISOString(),
    // 사용자 입력 데이터 추가
    my_position: userInput.my_position,
    my_job: userInput.my_job,
    tone_level: userInput.tone_level,
    guide: userInput.guide,
    task_type: userInput.task_type,
    my_goal: userInput.my_goal,
    text_length: userInput.text_length,
    audience: userInput.audience
  };

  // 원본 버튼 텍스트 저장
  const originalBtnText = sendBtn.innerHTML;

  try {
    // 버튼 비활성화 및 텍스트 변경
    sendBtn.classList.add('loading');
    sendBtn.disabled = true;
    sendBtn.innerHTML = `
      <svg width="16" height="16" style="animation: spin 1s linear infinite; margin-right: 8px;" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="30 10" />
      </svg>
      <span>AI 분석 중...</span>
    `;
    
    // 스피너 애니메이션 추가
    if (!document.getElementById('btn-spinner-animation')) {
      const style = document.createElement('style');
      style.id = 'btn-spinner-animation';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    const res = await fetch(ADVISE_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
    
    if (res.status === 401) {
      // 토큰 만료 시 refresh 시도
      if (await refreshAccessToken()) {
        // 토큰 갱신 후 재시도
        const retryRes = await fetch(ADVISE_URL, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload)
        });
        if (!retryRes.ok) throw new Error(`HTTP ${retryRes.status}`);
        const result = await retryRes.json();
        showResponse(result.output, result.token, result.remainingTokens);
        showToast('✓ AI 조언 완료!', 'success');
        return;
      } else {
        throw new Error('인증 실패');
      }
    }
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const result = await res.json();
    
    // 응답 표시
    showResponse(result.output, result.token, result.remainingTokens);
    
    showToast('✓ AI 조언 완료!', 'success');
  } catch (e) {
    showToast(`실패: ${e.message || e}`, 'error');
  } finally {
    // 버튼 복원
    sendBtn.innerHTML = originalBtnText;
    sendBtn.classList.remove('loading');
    sendBtn.disabled = false;
  }
}

async function refreshAccessToken() {
  try {
    const response = await fetch(`${AUTH_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (response.ok) {
      const data = await response.json();
      accessToken = data.accessToken;
      localStorage.setItem('accessToken', accessToken);
      return true;
    }
  } catch (error) {
    console.error('토큰 갱신 실패:', error);
  }
  return false;
}

// 사용자 정보 로드
async function loadUserInfo() {
  if (!accessToken || !refreshToken) return;
  
  try {
    // refresh API를 통해 최신 accessToken 받아오기
    const refreshResponse = await fetch(`${AUTH_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (!refreshResponse.ok) throw new Error('토큰 갱신 실패');
    
    const refreshData = await refreshResponse.json();
    accessToken = refreshData.accessToken;
    localStorage.setItem('accessToken', accessToken);
    
    // JWT에서 username 추출하여 토큰 잔액 조회
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    const balanceResponse = await fetch(`${AUTH_URL}/token-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: payload.username })
    });
    
    if (balanceResponse.ok) {
      const balanceData = await balanceResponse.json();
      tokenBalance = balanceData.tokenAmount || 0;
      updateTokenBalance();
    }
    
    return true;
  } catch (error) {
    console.error('사용자 정보 로드 실패:', error);
    throw error;
  }
}

// 토큰 잔액 업데이트
function updateTokenBalance() {
  const tokenBalanceEl = shadow?.querySelector('#nm-token-balance');
  if (tokenBalanceEl) {
    tokenBalanceEl.textContent = `${tokenBalance.toLocaleString()}`;
  }
}

// 금액 선택 모달 표시
function showAmountModal() {
  const amounts = [
    { price: 3000, label: '3천원', tokens: '3,000 토큰', popular: false },
    { price: 5000, label: '5천원', tokens: '5,000 토큰', popular: false },
    { price: 10000, label: '1만원', tokens: '10,000 토큰', popular: true },
    { price: 50000, label: '5만원', tokens: '50,000 토큰', popular: false },
  ];
  
  // 인라인 스타일로 모달 생성 (CSS 로드 없이도 동작)
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 999999;
    backdrop-filter: blur(4px);
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 32px;
    border-radius: 16px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    animation: slideIn 0.3s ease-out;
  `;
  
  // CSS 애니메이션 추가
  if (!document.getElementById('modal-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'modal-animation-styles';
    style.textContent = `
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  content.innerHTML = `
    <h3 style="font-size: 20px; font-weight: 700; color: #191f28; margin: 0 0 24px 0; text-align: center;">💳 토큰 충전</h3>
    ${amounts.map(a => `
      <button class="payment-btn" data-price="${a.price}" style="
        width: 100%;
        padding: 16px 20px;
        margin: 8px 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-size: 16px;
        font-weight: 600;
        transition: all 0.2s;
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <div>
          <div style="font-size: 18px; font-weight: 700;">${a.label}</div>
          <div style="font-size: 14px; color: rgba(255,255,255,0.8); margin-top: 4px;">${a.tokens}</div>
        </div>
        ${a.popular ? '<span style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 12px; font-size: 12px;">인기</span>' : ''}
      </button>
    `).join('')}
    <button id="close-modal" style="
      width: 100%;
      padding: 14px 20px;
      margin: 16px 0 0 0;
      background: #f8f9fa;
      color: #6c757d;
      border: 1.5px solid #e9ecef;
      border-radius: 12px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
    ">취소</button>
  `;
  
  modal.appendChild(content);
  
  // Shadow DOM 밖으로 모달 추가 (document.body에 직접 추가)
  document.body.appendChild(modal);
  
  // 버튼 호버 효과 추가
  content.querySelectorAll('.payment-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.4)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = 'none';
    });
    btn.addEventListener('click', async () => {
      const amount = parseInt(btn.dataset.price);
      try {
        document.body.removeChild(modal);
      } catch (e) {
        console.error('모달 제거 오류:', e);
      }
      await processPayment(amount);
    });
  });
  
  content.querySelector('#close-modal').addEventListener('click', () => {
    try {
      document.body.removeChild(modal);
    } catch (e) {
      console.error('모달 제거 오류:', e);
    }
  });
  
  // 모달 외부 클릭 시 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      try {
        document.body.removeChild(modal);
      } catch (e) {
        console.error('모달 제거 오류:', e);
      }
    }
  });
  
  console.log('모달 생성 완료:', modal);
}

async function processPayment(amount) {
  if (!window.confirm(`${amount.toLocaleString()}원 (${amount.toLocaleString()} 토큰)을 충전하시겠습니까?`)) {
    return;
  }
  
  if (!accessToken) {
    alert('로그인이 필요합니다.');
    return;
  }
  
  const loadingModal = showLoadingModal('결제 처리 중...');
  
  try {
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const res = await fetch(`${PAYMENT_URL}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ orderId, amount }),
    });
    
    if (document.body.contains(loadingModal)) {
      document.body.removeChild(loadingModal);
    }
    
    if (res.ok) {
      const result = await res.json();
      showSuccessModal(`${result.tokens.toLocaleString()} 토큰이 충전되었습니다!`);
      tokenBalance += result.tokens;
      updateTokenBalance();
    } else {
      const error = await res.json().catch(() => ({ message: '알 수 없는 오류' }));
      alert(`결제 실패: ${error.message}`);
    }
  } catch (error) {
    if (document.body.contains(loadingModal)) {
      document.body.removeChild(loadingModal);
    }
    alert(`결제 중 오류가 발생했습니다`);
  }
}

// 로딩 모달 표시
function showLoadingModal(message) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 999999;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 40px;
    border-radius: 16px;
    text-align: center;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  `;
  
  content.innerHTML = `
    <div style="
      width: 50px;
      height: 50px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    "></div>
    <div style="font-size: 16px; font-weight: 600; color: #191f28;">${message}</div>
  `;
  
  // 스피너 애니메이션 추가
  if (!document.getElementById('spinner-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'spinner-animation-styles';
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  return modal;
}

// 토스트 알림 표시
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'};
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    z-index: 999999;
    font-size: 15px;
    font-weight: 600;
    animation: slideInRight 0.3s ease-out;
    max-width: 300px;
  `;
  
  // 애니메이션 추가
  if (!document.getElementById('toast-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-animation-styles';
    style.textContent = `
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @keyframes slideOutRight {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(100px);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // 3초 후 자동 제거
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// 성공 모달 표시
function showSuccessModal(message) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 999999;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 40px;
    border-radius: 16px;
    text-align: center;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
    max-width: 400px;
  `;
  
  content.innerHTML = `
    <div style="
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      color: white;
      font-size: 30px;
    ">✓</div>
    <div style="font-size: 18px; font-weight: 700; color: #191f28; margin-bottom: 12px;">충전 완료!</div>
    <div style="font-size: 14px; color: #8b95a1; margin-bottom: 24px;">${message}</div>
    <button onclick="this.closest('div[style*=\\'position: fixed\\']').remove()" style="
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    ">확인</button>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // 3초 후 자동 닫기
  setTimeout(() => {
    if (document.body.contains(modal)) {
      document.body.removeChild(modal);
    }
  }, 3000);
}

/* ===== 응답 표시 ===== */
function showResponse(advice, tokenCount, remainingTokens) {
  if (!responseEl || !adviceContentEl || !tokenInfoEl) return;
  
  // 조언 내용 저장
  currentAdvice = advice;
  
  // 토큰 잔액 업데이트
  tokenBalance = remainingTokens;
  updateTokenBalance();
  
  // 상태 초기화 (새로운 조언이므로)
  isApplied = false;
  applyBtn.textContent = '적용';
  
  // UI 업데이트
  adviceContentEl.textContent = advice;
  tokenInfoEl.textContent = `${tokenCount} 토큰 사용${remainingTokens ? ` (남은 토큰: ${remainingTokens})` : ''}`;
  
  // 응답 영역과 적용 버튼 표시
  responseEl.style.display = 'block';
  applyBtn.style.display = 'inline-block';
  
  // 패널 높이 조정을 위해 스크롤
  responseEl.scrollIntoView({ behavior: 'smooth' });
}

/* ===== 적용/되돌리기 버튼 클릭 ===== */
function onApplyClick() {
  if (!editorEl || !currentAdvice) return;
  
  try {
    if (!isApplied) {
      // 적용하기
      // 현재 내용을 원문으로 저장
      originalContent = TEXT_MODE === 'html' ? editorEl.innerHTML : editorEl.innerText;
      
      // 에디터에 조언 내용 적용
      if (TEXT_MODE === 'html') {
        editorEl.innerHTML = currentAdvice;
      } else {
        editorEl.innerText = currentAdvice;
      }
      
      // 버튼 텍스트 변경
      applyBtn.textContent = '되돌리기';
      isApplied = true;
      
      // 토스트 알림
      showToast('✓ 적용 완료!', 'success');
      
    } else {
      // 되돌리기
      if (TEXT_MODE === 'html') {
        editorEl.innerHTML = originalContent;
      } else {
        editorEl.innerText = originalContent;
      }
      
      // 버튼 텍스트 변경
      applyBtn.textContent = '적용';
      isApplied = false;
      
      // 토스트 알림
      showToast('↶ 되돌리기 완료!', 'success');
    }
    
  } catch (e) {
    console.error('적용/되돌리기 중 오류:', e);
    showToast(`오류: ${e.message}`, 'error');
  }
}

/* ===== 시작/정지 ===== */
function start() {
  editorEl = findEditor(); // 현재 에디터 요소 찾기
  let last = ''; // 이전 스냅샷 내용 저장 (변화 감지용)

  // 폴링 (일정 간격으로 에디터 내용 체크)
  stopPolling(); // 기존 폴링 정리
  pollId = setInterval(() => {
    // 에디터 교체/제거시 재탐색 (페이지 변경으로 에디터가 바뀌었을 수 있음)
    if (!editorEl || !editorEl.ownerDocument || !editorEl.ownerDocument.contains(editorEl)) {
      editorEl = findEditor(); // 에디터 다시 찾기
      last = ''; // 이전 내용 초기화
    }
    if (!editorEl) return; // 에디터가 없으면 스킵

    const snap = snapshot(editorEl); // 현재 에디터 내용 스냅샷
    if (snap !== last) { last = snap; render(snap); } // 내용이 바뀌었으면 패널에 렌더링
  }, POLL_MS); // 120ms마다 실행

  // 문서 전체 변화 감시(교체 대응) - DOM 변화를 실시간으로 감지
  if (mo) mo.disconnect(); // 기존 옵저버 정리
  mo = new MutationObserver(() => {
    // 에디터가 DOM에서 제거되었는지 체크
    if (!editorEl || !editorEl.ownerDocument || !editorEl.ownerDocument.contains(editorEl)) {
      editorEl = findEditor(); // 에디터 다시 찾기
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true }); // 전체 문서 변화 감시
}

function stop() {
  stopPolling(); // 폴링 정지
  if (mo) mo.disconnect(), mo = null; // DOM 변화 감시 정지
  editorEl = null; // 에디터 참조 초기화
}

function stopPolling() {
  if (pollId) clearInterval(pollId), pollId = null; // 폴링 타이머 정리
}

/* ===== 액션 클릭 메시지 ===== */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'TOGGLE_PANEL') togglePanel();
});

/* ===== 초기 ===== */
ensurePanel();
