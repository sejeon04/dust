// Vercel 서버리스 함수 핸들러
module.exports = async function handler(req, res) {
  // CORS 및 캐시 관련 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  // GET 요청 메서드만 허용
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'GET 요청만 지원합니다.' });
  }

  // 쿼리스트링에서 시도 이름 추출 (기본값: '서울')
  const { sido = '서울' } = req.query;

  // 환경변수에서 에어코리아 디코딩 인증키 읽기
  const serviceKey = process.env.AIRKOREA_KEY;

  // 인증키 환경변수 미등록 시 안내 에러 반환
  if (!serviceKey) {
    return res.status(500).json({
      message: '서버 환경변수(AIRKOREA_KEY)에 인증키가 설정되지 않았습니다.'
    });
  }

  // 디코딩 키를 URL 전송용으로 인코딩 처리
  const encodedServiceKey = encodeURIComponent(serviceKey.trim());

  // 에어코리아 API 호출을 위한 전체 주소 조합
  const apiUrl = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodedServiceKey}&returnType=json&numOfRows=100&pageNo=1&sidoName=${encodeURIComponent(sido)}&ver=1.3`;

  try {
    // 외부 공공데이터포털 API 호출
    const response = await fetch(apiUrl);

    // 응답 텍스트 원문 읽기 (JSON 또는 XML 에러 파싱 대비)
    const rawText = await response.text();

    // 1. JSON 형식 검증 (XML 에러 페이지 수신 시 예외 처리)
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      // JSON 파싱 실패는 인증키 불일치 등으로 XML 에러가 반환된 경우임
      return res.status(400).json({
        message: '인증키 또는 요청값을 확인해주세요. (공공데이터 포털에서 올바른 응답을 받지 못했습니다)'
      });
    }

    // 2. 공공데이터 응답 내부 resultCode 성공 여부("00") 확인
    const header = data?.response?.header;
    if (!header || header.resultCode !== '00') {
      const errMsg = header?.resultMsg || '알 수 없는 API 에러가 발생했습니다.';
      return res.status(400).json({
        message: `API 응답 오류: ${errMsg} (결과코드: ${header?.resultCode || '없음'})`
      });
    }

    // 정상 데이터 클라이언트에 반환
    return res.status(200).json(data);

  } catch (error) {
    // 네트워크 및 서버 통신 예외 처리
    console.error('API 호출 중 내부 오류:', error);
    return res.status(500).json({
      message: '공공데이터포털 서버 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    });
  }
};

