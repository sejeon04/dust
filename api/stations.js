// 전국 주요 측정소 좌표 기본 데이터셋 (API 키 미승인 시에도 지도가 즉시 작동하도록 보장)
const FALLBACK_COORDINATES = {
  // 서울 25개 구 도시대기 측정소
  '중구': [37.5642, 126.9979],
  '종로구': [37.5720, 127.0050],
  '용산구': [37.5326, 126.9810],
  '성동구': [37.5646, 127.0364],
  '광진구': [37.5427, 127.0858],
  '동대문구': [37.5757, 127.0397],
  '중랑구': [37.5953, 127.0928],
  '성북구': [37.5894, 127.0182],
  '강북구': [37.6378, 127.0255],
  '도봉구': [37.6658, 127.0422],
  '노원구': [37.6552, 127.0671],
  '은평구': [37.6026, 126.9292],
  '서대문구': [37.5791, 126.9368],
  '마포구': [37.5637, 126.9084],
  '양천구': [37.5259, 126.8566],
  '강서구': [37.5492, 126.8358],
  '구로구': [37.4987, 126.8870],
  '금천구': [37.4568, 126.8974],
  '영등포구': [37.5264, 126.8962],
  '동작구': [37.5028, 126.9793],
  '관악구': [37.4785, 126.9515],
  '서초구': [37.5048, 127.0049],
  '강남구': [37.5180, 127.0474],
  '송파구': [37.5145, 127.1059],
  '강동구': [37.5301, 127.1237],
  // 각 시도별 대표 측정소
  '부산': [35.1796, 129.0756],
  '대구': [35.8714, 128.6014],
  '인천': [37.4563, 126.7052],
  '광주': [35.1595, 126.8526],
  '대전': [36.3504, 127.3845],
  '울산': [35.5384, 129.3114],
  '세종': [36.4800, 127.2890],
  '경기': [37.2636, 127.0286],
  '강원': [37.8854, 127.7298],
  '충북': [36.6424, 127.4890],
  '충남': [36.5184, 126.8000],
  '전북': [35.8242, 127.1480],
  '전남': [34.8160, 126.4630],
  '경북': [36.5760, 128.5056],
  '경남': [35.2280, 128.6811],
  '제주': [33.4996, 126.5312]
};

// 시도별 기본 중심 좌표
const SIDO_CENTERS = {
  '서울': [37.5665, 126.9780],
  '전국': [36.2, 127.8],
  '부산': [35.1796, 129.0756],
  '대구': [35.8714, 128.6014],
  '인천': [37.4563, 126.7052],
  '광주': [35.1595, 126.8526],
  '대전': [36.3504, 127.3845],
  '울산': [35.5384, 129.3114],
  '세종': [36.4800, 127.2890],
  '경기': [37.4138, 127.5183],
  '강원': [37.8228, 128.1555],
  '충북': [36.8, 127.7],
  '충남': [36.6, 126.8],
  '전북': [35.7175, 127.153],
  '전남': [34.8679, 126.991],
  '경북': [36.4919, 128.8889],
  '경남': [35.4606, 128.2132],
  '제주': [33.3996, 126.5312]
};

// Vercel 서버리스 함수 핸들러
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');

  const { sido = '서울' } = req.query;
  const serviceKey = process.env.AIRKOREA_KEY;

  const result = {
    sidoCenter: SIDO_CENTERS[sido] || [37.5665, 126.9780],
    stations: {}
  };

  // 1. 공공데이터포털 측정소정보 API(getMsrstnList) 호출 시도
  if (serviceKey) {
    try {
      const encodedKey = encodeURIComponent(serviceKey.trim());
      const apiUrl = `https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList?serviceKey=${encodedKey}&returnType=json&numOfRows=1000&pageNo=1&addr=${encodeURIComponent(sido === '전국' ? '' : sido)}`;
      
      const apiRes = await fetch(apiUrl);
      const text = await apiRes.text();
      const data = JSON.parse(text);
      const items = data?.response?.body?.items || [];

      items.forEach(item => {
        const name = item.stationName;
        // dmX: 위도 또는 경도, dmY: 경도 또는 위도
        const lat = parseFloat(item.dmX);
        const lng = parseFloat(item.dmY);
        if (name && !isNaN(lat) && !isNaN(lng)) {
          // 한국 위도(33~39), 경도(124~132) 범위 검증
          if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) {
            result.stations[name] = [lat, lng];
          } else if (lng >= 33 && lng <= 39 && lat >= 124 && lat <= 132) {
            result.stations[name] = [lng, lat];
          }
        }
      });
    } catch (err) {
      // API 키 미신청 등으로 에러가 발생한 경우 fallback 데이터 활용
    }
  }

  // 2. 누락된 측정소에 대해 fallback 좌표 병합
  Object.keys(FALLBACK_COORDINATES).forEach(name => {
    if (!result.stations[name]) {
      result.stations[name] = FALLBACK_COORDINATES[name];
    }
  });

  return res.status(200).json(result);
};

