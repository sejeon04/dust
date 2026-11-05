// 로컬 개발 및 테스트용 Node.js 서버 (외부 패키지 설치 필요 없음)
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// .env.local 파일에서 환경변수 로드
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=');
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join('=').trim();
      }
    }
  });
}

// api/dust.js 핸들러 불러오기
const dustHandler = require('./api/dust');

// MIME 타입 매핑
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 1. /api/dust 요청 처리 (Vercel 서버리스 함수 시뮬레이션)
  if (pathname === '/api/dust') {
    // Vercel 형식의 req 객체 모의
    req.query = parsedUrl.query;

    // Vercel 형식의 res.status().json() 메서드 모의
    let statusCode = 200;
    const mockRes = {
      setHeader: (key, val) => res.setHeader(key, val),
      status: (code) => {
        statusCode = code;
        return mockRes;
      },
      json: (data) => {
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      }
    };

    try {
      await dustHandler(req, mockRes);
    } catch (err) {
      console.error('API Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: '서버 내부 오류가 발생했습니다.' }));
    }
    return;
  }

  // 2. 정적 파일 서빙 (index.html, style.css, script.js 등)
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Not Found</h1>');
      } else {
        res.writeHead(500);
        res.end(`서버 오류: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`로컬 서버 실행 중: http://localhost:${PORT}`);
});

