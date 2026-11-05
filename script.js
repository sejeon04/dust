// Vercel 서버리스 대기오염 및 측정소 좌표 프록시 API 엔드포인트
const DUST_API_URL = '/api/dust';
const STATIONS_API_URL = '/api/stations';

// DOM 요소 참조: 시도 선택 드롭다운 및 선택 지역 텍스트
const sidoSelect = document.getElementById('sido-select');
const selectedSidoText = document.getElementById('selected-sido-text');

// [공기 신호등] 상단 대형 요약 카드 및 요소 참조
const trafficLightCard = document.getElementById('traffic-light-card');
const signalEmoji = document.getElementById('signal-emoji');
const signalStatus = document.getElementById('signal-status');
const signalValue = document.getElementById('signal-value');
const signalAdvice = document.getElementById('signal-advice');
const signalTime = document.getElementById('signal-time');

// 차트 섹션 및 캔버스 요소 참조
const chartSection = document.getElementById('chart-section');
const dustChartCanvas = document.getElementById('dust-chart');

// 검색 관련 DOM 요소 참조
const stationSearchInput = document.getElementById('station-search');
const searchClearBtn = document.getElementById('search-clear');
const searchCount = document.getElementById('search-count');

// 로딩 및 상태 메시지, 카드 그리드 요소 참조
const loadingIndicator = document.getElementById('loading-indicator');
const statusMessage = document.getElementById('status-message');
const stationList = document.getElementById('station-list');

// 전역 상태 변수: 차트 인스턴스, Leaflet 지도 및 마커 그룹, 현재 측정소 데이터
let dustChartInstance = null;
let leafletMap = null;
let markerLayerGroup = null;
let allStationItems = [];
let stationCoordinates = {};

// 등급별 이모지, 라벨, 가이드 문구, CSS 클래스, 지도/차트 색상 테마 설정
const GRADE_THEME = {
  '1': {
    emoji: '🔵',
    label: '좋음',
    advice: '공기가 맑고 쾌적해요! 산책하기 좋은 날씨입니다 🌿',
    cardClass: 'card-grade-1',
    badgeClass: 'badge-grade-1',
    chartColor: '#3b82f6',
    chartBorder: '#1d4ed8',
    mapColor: '#2563eb' // 지도 마커 파란색
  },
  '2': {
    emoji: '🟢',
    label: '보통',
    advice: '실외 활동하기에 무난한 공기질이에요 😊',
    cardClass: 'card-grade-2',
    badgeClass: 'badge-grade-2',
    chartColor: '#22c55e',
    chartBorder: '#15803d',
    mapColor: '#16a34a' // 지도 마커 초록색
  },
  '3': {
    emoji: '🟠',
    label: '나쁨',
    advice: '외출 시 마스크를 챙기세요 😷',
    cardClass: 'card-grade-3',
    badgeClass: 'badge-grade-3',
    chartColor: '#f97316',
    chartBorder: '#c2410c',
    mapColor: '#ea580c' // 지도 마커 주황색
  },
  '4': {
    emoji: '🔴',
    label: '매우나쁨',
    advice: '외출 시 마스크를 챙기세요 😷 (야외 활동을 자제하세요)',
    cardClass: 'card-grade-4',
    badgeClass: 'badge-grade-4',
    chartColor: '#ef4444',
    chartBorder: '#b91c1c',
    mapColor: '#dc2626' // 지도 마커 빨간색
  },
  'default': {
    emoji: '⚪',
    label: '측정 안 됨',
    advice: '현재 수집된 측정 데이터가 충분하지 않습니다.',
    cardClass: 'card-grade-default',
    badgeClass: 'badge-grade-default',
    chartColor: '#9ca3af',
    chartBorder: '#64748b',
    mapColor: '#9ca3af' // 지도 마커 회색
  }
};

// 미세먼지 수치(PM10)에 따라 등급 번호('1'~'4')를 계산하는 함수
function getPm10GradeKey(val) {
  if (val === null || isNaN(val)) return 'default';
  if (val <= 30) return '1';
  if (val <= 80) return '2';
  if (val <= 150) return '3';
  return '4';
}

// 측정 시각 포맷 변환 함수 ('2026-10-28 16:00' -> '2026년 10월 28일 16시 기준')
function formatKoreanDateTime(dateTimeStr) {
  if (!dateTimeStr || typeof dateTimeStr !== 'string') return '측정 시각: 정보 없음';
  const match = dateTimeStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (match) {
    return `${match[1]}년 ${parseInt(match[2], 10)}월 ${parseInt(match[3], 10)}일 ${parseInt(match[4], 10)}시 기준`;
  }
  return `${dateTimeStr} 기준`;
}

// 측정값이 "-" 이거나 빈 값인 경우 표시 형식 정제 함수
function formatDustValue(value) {
  if (!value || value.trim() === '-' || isNaN(Number(value))) return '측정 안 됨';
  return `${value} ㎍/㎥`;
}

// 유효한 숫자인지 판별하여 평균 및 차트 계산 시 사용하는 함수
function isValidNumber(value) {
  if (!value || value.trim() === '-') return false;
  return !isNaN(Number(value));
}

// Leaflet 지도 초기화 함수 (최초 1회 실행)
function initLeafletMap() {
  if (leafletMap) return;
  // 서울 시청 좌표 기준 기본 맵 생성
  leafletMap = L.map('map', {
    center: [37.5665, 126.9780],
    zoom: 11,
    zoomControl: true
  });

  // OpenStreetMap 무료 타일 레이어 추가
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors'
  }).addTo(leafletMap);

  // 마커들을 묶어서 관리할 레이어 그룹 생성
  markerLayerGroup = L.layerGroup().addTo(leafletMap);
}

// 측정소 정보 API(/api/stations)를 호출하여 좌표 목록을 갱신하는 비동기 함수
async function fetchStationCoordinates(sidoName) {
  try {
    const res = await fetch(`${STATIONS_API_URL}?sido=${encodeURIComponent(sidoName)}`);
    if (res.ok) {
      const data = await res.json();
      stationCoordinates = data.stations || {};
      // 시도 중심 좌표가 존재하면 지도 중심 이동
      if (leafletMap && data.sidoCenter) {
        const zoom = sidoName === '전국' ? 7 : (sidoName === '제주' || sidoName === '세종' ? 11 : 11);
        leafletMap.setView(data.sidoCenter, zoom);
      }
    }
  } catch (err) {
    console.warn('측정소 좌표 불러오기 오류 (기본 좌표셋 사용):', err);
  }
}

// 데이터 전체 조회 및 통합 렌더링 함수
async function fetchAirQualityData(sidoName) {
  loadingIndicator.style.display = 'flex';
  statusMessage.style.display = 'none';
  stationList.innerHTML = '';
  stationSearchInput.value = '';
  searchClearBtn.style.display = 'none';

  try {
    // 지도 초기화 및 좌표 조회 병렬 진행
    initLeafletMap();
    await fetchStationCoordinates(sidoName);

    // 대기오염 측정 데이터 API 호출
    const response = await fetch(`${DUST_API_URL}?sido=${encodeURIComponent(sidoName)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || '데이터를 가져오는 중 문제가 발생했습니다.');
    }

    const items = data?.response?.body?.items || [];
    allStationItems = items;

    if (items.length === 0) {
      statusMessage.style.display = 'block';
      statusMessage.textContent = '조회된 대기오염 측정소 데이터가 없습니다.';
      resetSummary(sidoName);
      destroyChart();
      if (markerLayerGroup) markerLayerGroup.clearLayers();
      searchCount.textContent = '조회된 측정소가 없습니다.';
      return;
    }

    // 1. 상단 공기 신호등 요약 갱신
    updateTrafficLight(items, sidoName);
    // 2. 가로 막대그래프 렌더링
    renderDustChart(items);
    // 3. 지도 위에 등급 색상 마커 표시
    renderMapMarkers(items);
    // 4. 측정소 카드 목록 렌더링
    renderStationCards(items);
    // 5. 검색 카운트 라벨 갱신
    updateSearchCount(items.length, items.length);

  } catch (error) {
    console.error('데이터 조회 오류:', error);
    statusMessage.style.display = 'block';
    statusMessage.textContent = error.message;
    resetSummary(sidoName);
    destroyChart();
  } finally {
    loadingIndicator.style.display = 'none';
  }
}

// 상단 '공기 신호등' 대형 대표 상태 요약 카드 업데이트 함수
function updateTrafficLight(items, sidoName) {
  selectedSidoText.textContent = sidoName;

  const validValues = items
    .filter(item => isValidNumber(item.pm10Value))
    .map(item => Number(item.pm10Value));

  const rawTime = items[0]?.dataTime || '';
  signalTime.textContent = formatKoreanDateTime(rawTime);

  if (validValues.length === 0) {
    applyTrafficTheme('default', '-', '측정 안 됨');
    return;
  }

  const totalSum = validValues.reduce((acc, curr) => acc + curr, 0);
  const avg = Math.round(totalSum / validValues.length);
  const gradeKey = getPm10GradeKey(avg);
  const theme = GRADE_THEME[gradeKey];

  applyTrafficTheme(gradeKey, `${avg} ㎍/㎥`, theme.label);
}

// 공기 신호등 스타일 및 텍스트 적용 도우미 함수
function applyTrafficTheme(gradeKey, valueText, statusText) {
  const theme = GRADE_THEME[gradeKey] || GRADE_THEME['default'];
  trafficLightCard.className = `traffic-light-card ${theme.cardClass}`;
  signalEmoji.textContent = theme.emoji;
  signalStatus.textContent = statusText || theme.label;
  signalValue.innerHTML = `${valueText}`;
  signalAdvice.textContent = theme.advice;
}

// 상단 신호등 초기화 함수
function resetSummary(sidoName) {
  selectedSidoText.textContent = sidoName;
  signalTime.textContent = '측정 시각: -';
  applyTrafficTheme('default', '-', '측정 불가');
}

// 기존 차트 인스턴스 파괴 함수
function destroyChart() {
  if (dustChartInstance) {
    dustChartInstance.destroy();
    dustChartInstance = null;
  }
  chartSection.style.display = 'none';
}

// [가로 막대그래프] 미세먼지 수치 상위 10개 렌더링 함수
function renderDustChart(items) {
  const validItems = items.filter(item => isValidNumber(item.pm10Value));

  if (validItems.length === 0) {
    destroyChart();
    return;
  }

  validItems.sort((a, b) => Number(b.pm10Value) - Number(a.pm10Value));
  const top10Items = validItems.slice(0, 10);

  const labels = top10Items.map(item => item.stationName || '알 수 없음');
  const values = top10Items.map(item => Number(item.pm10Value));

  const backgroundColors = top10Items.map(item => {
    const gradeKey = item.pm10Grade ? String(item.pm10Grade).trim() : getPm10GradeKey(Number(item.pm10Value));
    return (GRADE_THEME[gradeKey] || GRADE_THEME['default']).chartColor;
  });

  const borderColors = top10Items.map(item => {
    const gradeKey = item.pm10Grade ? String(item.pm10Grade).trim() : getPm10GradeKey(Number(item.pm10Value));
    return (GRADE_THEME[gradeKey] || GRADE_THEME['default']).chartBorder;
  });

  chartSection.style.display = 'flex';

  if (dustChartInstance) {
    dustChartInstance.destroy();
  }

  dustChartInstance = new Chart(dustChartCanvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '미세먼지 (PM10)',
        data: values,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6,
        barPercentage: 0.7
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const gradeKey = getPm10GradeKey(val);
              const gradeLabel = GRADE_THEME[gradeKey]?.label || '';
              return ` 미세먼지: ${val} ㎍/㎥ (${gradeLabel})`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { font: { family: 'Pretendard', size: 11 }, color: '#64748b' }
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: 'Pretendard', weight: 'bold', size: 12 }, color: '#1e293b' }
        }
      }
    }
  });
}

// [지도에 찍기] Leaflet 지도 위에 등급 색상 원형 마커 렌더링 함수
function renderMapMarkers(items) {
  if (!leafletMap || !markerLayerGroup) return;

  // 기존 마커 전체 제거
  markerLayerGroup.clearLayers();

  const bounds = [];

  items.forEach(item => {
    const stationName = item.stationName;
    const coords = stationCoordinates[stationName];

    // 해당 측정소의 좌표가 존재하는 경우 마커 생성
    if (coords && coords.length === 2) {
      const gradeKey = item.pm10Grade ? String(item.pm10Grade).trim() : getPm10GradeKey(Number(item.pm10Value));
      const theme = GRADE_THEME[gradeKey] || GRADE_THEME['default'];
      const pm10Text = formatDustValue(item.pm10Value);
      const pm25Text = formatDustValue(item.pm25Value);
      const timeText = formatKoreanDateTime(item.dataTime);

      // 등급 색상 원형 마커 생성
      const marker = L.circleMarker(coords, {
        radius: 9,
        fillColor: theme.mapColor,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85
      });

      // 마커 클릭 시 나타날 한국어 정보 팝업 바인딩
      const popupHtml = `
        <div class="map-popup">
          <h4>${theme.emoji} ${stationName} 측정소</h4>
          <div class="popup-row">
            <span class="popup-label">상태:</span>
            <span class="popup-val" style="color: ${theme.mapColor}">${theme.label}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">미세먼지(PM10):</span>
            <span class="popup-val">${pm10Text}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">초미세먼지(PM2.5):</span>
            <span class="popup-val">${pm25Text}</span>
          </div>
          <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">
            ${timeText}
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml);

      // 마커 그룹에 추가
      markerLayerGroup.addLayer(marker);
      bounds.push(coords);
    }
  });

  // 검색 시 마커 영역으로 지도 화면 자동 맞춤
  if (bounds.length > 0 && bounds.length < allStationItems.length) {
    leafletMap.fitBounds(bounds, { maxZoom: 13, padding: [30, 30] });
  }
}

// 측정소별 카드 목록 렌더링 함수
function renderStationCards(items) {
  stationList.innerHTML = '';

  if (items.length === 0) {
    stationList.innerHTML = `<div class="no-results">🔍 일치하는 측정소가 없습니다. 다른 이름으로 검색해보세요.</div>`;
    return;
  }

  items.forEach(item => {
    const stationName = item.stationName || '알 수 없음';
    const pm10Text = formatDustValue(item.pm10Value);
    const pm25Text = formatDustValue(item.pm25Value);
    const formattedTime = formatKoreanDateTime(item.dataTime);

    const gradeKey = item.pm10Grade ? String(item.pm10Grade).trim() : 'default';
    const theme = GRADE_THEME[gradeKey] || GRADE_THEME['default'];

    const card = document.createElement('div');
    card.className = `station-card ${theme.cardClass}`;

    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${stationName}</h3>
        <span class="status-badge ${theme.badgeClass}">${theme.emoji} ${theme.label}</span>
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
        ${formattedTime}
      </div>
    `;

    // 카드 클릭 시 해당 측정소의 지도로 부드럽게 이동 및 팝업 열기 연동
    card.addEventListener('click', () => {
      const coords = stationCoordinates[stationName];
      if (coords && leafletMap) {
        leafletMap.setView(coords, 14);
        // 지도 위치로 부드럽게 스크롤
        document.getElementById('map-section').scrollIntoView({ behavior: 'smooth' });
      }
    });

    stationList.appendChild(card);
  });
}

// 검색 결과 개수 표시 업데이트 함수
function updateSearchCount(filteredCount, totalCount) {
  if (filteredCount === totalCount) {
    searchCount.textContent = `전체 ${totalCount}개 측정소`;
  } else {
    searchCount.textContent = `검색 결과: ${filteredCount}개 (전체 ${totalCount}개 중)`;
  }
}

// [측정소 검색] 실시간 입력 필터링 이벤트 핸들러
function handleSearch() {
  const query = stationSearchInput.value.trim().toLowerCase();
  searchClearBtn.style.display = query ? 'block' : 'none';

  if (!query) {
    // 검색어가 없으면 전체 목록 복원
    renderStationCards(allStationItems);
    renderMapMarkers(allStationItems);
    updateSearchCount(allStationItems.length, allStationItems.length);
    return;
  }

  // 측정소 이름에 검색어가 포함된 항목만 필터링
  const filtered = allStationItems.filter(item => {
    const name = (item.stationName || '').toLowerCase();
    return name.includes(query);
  });

  // 필터링된 결과로 카드 및 지도 마커 동시 갱신
  renderStationCards(filtered);
  renderMapMarkers(filtered);
  updateSearchCount(filtered.length, allStationItems.length);
}

// 검색 입력 이벤트 연결
stationSearchInput.addEventListener('input', handleSearch);

// 검색어 초기화(✕) 버튼 클릭 이벤트
searchClearBtn.addEventListener('click', () => {
  stationSearchInput.value = '';
  handleSearch();
  stationSearchInput.focus();
});

// 시도 변경 드롭다운 이벤트 리스너
sidoSelect.addEventListener('change', (e) => {
  fetchAirQualityData(e.target.value);
});

// 페이지 로딩 완료 시 서울 지역 기준으로 초기 실행
document.addEventListener('DOMContentLoaded', () => {
  fetchAirQualityData(sidoSelect.value);
});
