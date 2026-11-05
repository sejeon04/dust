// Vercel 서버리스 프록시 API 엔드포인트 상대 경로
const API_URL = '/api/dust';

// 시도 선택 셀렉트 박스 DOM 요소
const sidoSelect = document.getElementById('sido-select');
// 선택된 시도 텍스트 표시 DOM 요소
const selectedSidoText = document.getElementById('selected-sido-text');
// 평균 미세먼지 수치 표시 DOM 요소
const averageValue = document.getElementById('average-value');
// 평균 상태 뱃지 DOM 요소
const averageBadge = document.getElementById('average-badge');
// 최근 업데이트 시각 DOM 요소
const lastUpdated = document.getElementById('last-updated');
// 로딩 및 상태 메시지 DOM 요소
const statusMessage = document.getElementById('status-message');
// 측정소 카드 그리드 컨테이너 DOM 요소
const stationList = document.getElementById('station-list');

// 등급 번호에 대응하는 한글 상태 명칭과 CSS 클래스 매핑 객체
const GRADE_CONFIG = {
  '1': { label: '좋음', cardClass: 'grade-1', badgeClass: 'badge-grade-1' },
  '2': { label: '보통', cardClass: 'grade-2', badgeClass: 'badge-grade-2' },
  '3': { label: '나쁨', cardClass: 'grade-3', badgeClass: 'badge-grade-3' },
  '4': { label: '매우나쁨', cardClass: 'grade-4', badgeClass: 'badge-grade-4' },
  'default': { label: '정보 없음', cardClass: 'grade-unknown', badgeClass: 'badge-grade-unknown' }
};

// 미세먼지 수치(PM10)에 따라 등급 정보를 반환하는 함수 (평균 수치 판별용)
function getPm10GradeByValue(val) {
  // 수치가 없거나 유효하지 않은 경우
  if (val === null || isNaN(val)) return GRADE_CONFIG['default'];
  // 0 ~ 30: 좋음
  if (val <= 30) return GRADE_CONFIG['1'];
  // 31 ~ 80: 보통
  if (val <= 80) return GRADE_CONFIG['2'];
  // 81 ~ 150: 나쁨
  if (val <= 150) return GRADE_CONFIG['3'];
  // 151 이상: 매우나쁨
  return GRADE_CONFIG['4'];
}

// 측정값이 "-" 이거나 빈 값인 경우 표시 형식 정제 함수
function formatDustValue(value) {
  // 값이 없거나 대시("-")인 경우 "측정 안 됨" 반환
  if (!value || value.trim() === '-' || isNaN(Number(value))) {
    return '측정 안 됨';
  }
  // 유효한 숫자인 경우 단위(㎍/㎥)와 함께 반환
  return `${value} ㎍/㎥`;
}

// 유효한 숫자인지 판별하여 평균 계산 시 사용하는 함수
function isValidNumber(value) {
  // 공백 제거 후 대시("-") 또는 빈 값 검사
  if (!value || value.trim() === '-') return false;
  // 숫자로 변환 가능 여부 확인
  return !isNaN(Number(value));
}

// 특정 시도의 대기오염 정보를 서버리스 API(/api/dust)로부터 가져오는 비동기 함수
async function fetchAirQualityData(sidoName) {
  // 로딩 시작 시 상태 메시지 노출 및 목록 초기화
  statusMessage.style.display = 'block';
  statusMessage.textContent = `${sidoName} 지역의 대기오염 정보를 조회 중입니다...`;
  stationList.innerHTML = '';

  try {
    // Vercel 서버리스 API 호출 (/api/dust?sido=시도이름)
    const response = await fetch(`${API_URL}?sido=${encodeURIComponent(sidoName)}`);

    // JSON 응답 데이터 파싱
    const data = await response.json();

    // 서버리스 함수에서 에러 응답(status 400, 500 등)을 전달한 경우
    if (!response.ok) {
      throw new Error(data.message || '데이터를 가져오는 중 문제가 발생했습니다.');
    }

    // 응답 데이터 내 측정소 항목 리스트 추출
    const items = data?.response?.body?.items || [];

    // 측정소 데이터가 없는 경우 처리
    if (items.length === 0) {
      statusMessage.textContent = '조회된 대기오염 측정소 데이터가 없습니다.';
      resetSummary();
      return;
    }

    // 정상 데이터 로딩 완료 시 메시지 숨김
    statusMessage.style.display = 'none';

    // 평균 수치 계산 및 상단 요약 영역 업데이트
    updateSummary(items, sidoName);

    // 측정소별 카드 목록 화면 렌더링
    renderStationCards(items);

  } catch (error) {
    // 오류 발생 시 서버가 반환한 한국어 에러 메시지 화면 출력
    console.error('데이터 조회 오류:', error);
    statusMessage.style.display = 'block';
    statusMessage.textContent = error.message;
    resetSummary();
  }
}

// 상단 평균 미세먼지 수치 및 뱃지 업데이트 함수
function updateSummary(items, sidoName) {
  // 선택된 시도명 텍스트 업데이트
  selectedSidoText.textContent = sidoName;

  // 유효한 미세먼지(PM10) 수치만 필터링하여 숫자 배열 생성 ("-" 제외)
  const validValues = items
    .filter(item => isValidNumber(item.pm10Value))
    .map(item => Number(item.pm10Value));

  // 유효한 측정값이 하나도 없는 경우
  if (validValues.length === 0) {
    averageValue.textContent = '측정 안 됨';
    averageBadge.className = 'status-badge grade-unknown';
    averageBadge.textContent = '데이터 없음';
    lastUpdated.textContent = '측정 시각: -';
    return;
  }

  // 유효한 수치들의 총합 계산
  const totalSum = validValues.reduce((acc, curr) => acc + curr, 0);
  // 평균값 계산 및 반올림
  const avg = Math.round(totalSum / validValues.length);

  // 평균 숫자를 화면에 굵게 표시
  averageValue.textContent = `${avg} ㎍/㎥`;

  // 평균 수치에 따른 등급 정보 획득
  const gradeInfo = getPm10GradeByValue(avg);

  // 평균 뱃지의 색상 클래스 및 텍스트 적용
  averageBadge.className = `status-badge ${gradeInfo.badgeClass}`;
  averageBadge.textContent = `평균 ${gradeInfo.label}`;

  // 가장 첫 번째 측정소의 측정 시각 표기
  const latestTime = items[0]?.dataTime || '-';
  lastUpdated.textContent = `측정 시각: ${latestTime}`;
}

// 상단 요약 영역 기본값 초기화 함수
function resetSummary() {
  averageValue.textContent = '-';
  averageBadge.className = 'status-badge grade-unknown';
  averageBadge.textContent = '데이터 없음';
  lastUpdated.textContent = '측정 시각: -';
}

// 측정소 목록을 기반으로 카드 요소들을 생성하여 화면에 추가하는 함수
function renderStationCards(items) {
  // 기존 목록 비우기
  stationList.innerHTML = '';

  // 각 측정소별 카드를 순회하며 생성
  items.forEach(item => {
    // 측정소 이름 (기본값 설정)
    const stationName = item.stationName || '알 수 없음';
    // 미세먼지(PM10) 값 포맷팅 ("-"인 경우 "측정 안 됨")
    const pm10Text = formatDustValue(item.pm10Value);
    // 초미세먼지(PM25) 값 포맷팅 ("-"인 경우 "측정 안 됨")
    const pm25Text = formatDustValue(item.pm25Value);
    // 측정 일시
    const dataTime = item.dataTime || '측정 시각 정보 없음';

    // PM10 등급 값 (1: 좋음, 2: 보통, 3: 나쁨, 4: 매우나쁨, 없으면 default)
    const gradeKey = item.pm10Grade ? String(item.pm10Grade).trim() : 'default';
    const gradeConfig = GRADE_CONFIG[gradeKey] || GRADE_CONFIG['default'];

    // 개별 카드 컨테이너 요소 생성
    const card = document.createElement('div');
    // 카드 기본 클래스 및 등급별 테두리 색상 클래스 추가
    card.className = `station-card ${gradeConfig.cardClass}`;

    // 카드 내부 HTML 구조 주입
    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${stationName}</h3>
        <span class="status-badge ${gradeConfig.badgeClass}">${gradeConfig.label}</span>
      </div>
      <div class="card-data-row">
        <span class="data-label">미세먼지 (PM10)</span>
        <span class="data-value">${pm10Text}</span>
      </div>
      <div class="card-data-row">
        <span class="data-label">초미세먼지 (PM2.5)</span>
        <span class="data-value">${pm25Text}</span>
      </div>
      <div class="card-footer">
        측정일시: ${dataTime}
      </div>
    `;

    // 생성된 카드를 전체 그리드 컨테이너에 추가
    stationList.appendChild(card);
  });
}

// 드롭다운 변경 이벤트 발생 시 선택된 시도 데이터 재조회
sidoSelect.addEventListener('change', (e) => {
  // 선택된 시도 값 전달하여 API 호출 실행
  fetchAirQualityData(e.target.value);
});

// 페이지 첫 로딩 시 기본 선택값('서울')으로 즉시 데이터 조회 시작
document.addEventListener('DOMContentLoaded', () => {
  // 초기 데이터 요청 실행
  fetchAirQualityData(sidoSelect.value);
});
