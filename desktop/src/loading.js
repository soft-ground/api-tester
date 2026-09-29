const lang = navigator.language && navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ko';
const STRINGS = {
  ko: {
    starting: '시작하는 중…',
    db: '로컬 데이터베이스 준비 중…',
    migrate: '데이터베이스 업데이트 적용 중…',
    server: '서버 시작 중…',
    retry: '문제가 발생해 다시 시도하는 중…',
    errorTitle: 'API Tester를 시작하지 못했습니다',
    retryBtn: '다시 시도',
    logsBtn: '로그 폴더 열기',
    quitBtn: '종료',
  },
  en: {
    starting: 'Starting…',
    db: 'Preparing local database…',
    migrate: 'Applying database updates…',
    server: 'Starting server…',
    retry: 'Something went wrong — retrying…',
    errorTitle: 'API Tester failed to start',
    retryBtn: 'Retry',
    logsBtn: 'Open logs folder',
    quitBtn: 'Quit',
  },
}[lang];

const stageText = document.getElementById('stage-text');
const progressEl = document.getElementById('progress');
const errorEl = document.getElementById('error');
const errorDetail = document.getElementById('error-detail');
const btnRetry = document.getElementById('btn-retry');
const btnLogs = document.getElementById('btn-logs');
const btnQuit = document.getElementById('btn-quit');

btnRetry.textContent = STRINGS.retryBtn;
btnLogs.textContent = STRINGS.logsBtn;
btnQuit.textContent = STRINGS.quitBtn;
document.getElementById('error-title').textContent = STRINGS.errorTitle;

window.boot.onStatus(({ stage }) => {
  stageText.textContent = STRINGS[stage] ?? STRINGS.starting;
});

window.boot.onError(({ message }) => {
  progressEl.classList.add('hidden');
  errorEl.classList.remove('hidden');
  errorDetail.textContent = message;
});

btnRetry.addEventListener('click', () => {
  errorEl.classList.add('hidden');
  progressEl.classList.remove('hidden');
  stageText.textContent = STRINGS.starting;
  window.boot.retry();
});
btnLogs.addEventListener('click', () => window.boot.openLogs());
btnQuit.addEventListener('click', () => window.boot.quit());
