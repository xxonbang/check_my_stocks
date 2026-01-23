/**
 * 간단한 JWT 인증 유틸리티
 * 클라이언트 사이드에서 동작하는 경량 JWT 구현
 */

// 환경변수에서 설정 로드
const ADMIN_ID = import.meta.env.VITE_ADMIN_ID || '';
const ADMIN_PW_HASH = import.meta.env.VITE_ADMIN_PW_HASH || ''; // 해시된 비밀번호
const JWT_SECRET = import.meta.env.VITE_JWT_SECRET || 'default-secret-key';
const TOKEN_EXPIRY_HOURS = 24; // 토큰 유효 시간

/**
 * Base64 URL 인코딩
 */
function base64UrlEncode(str) {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64 URL 디코딩
 */
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return atob(str);
}

/**
 * 간단한 HMAC-like 해시 생성 (SHA-256 사용)
 */
async function createSignature(data, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * JWT 토큰 생성
 */
export async function generateToken(userId) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (TOKEN_EXPIRY_HOURS * 60 * 60)
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));

  const signature = await createSignature(`${headerEncoded}.${payloadEncoded}`, JWT_SECRET);

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

/**
 * JWT 토큰 검증
 */
export async function verifyToken(token) {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerEncoded, payloadEncoded, signature] = parts;

    // 서명 검증
    const expectedSignature = await createSignature(`${headerEncoded}.${payloadEncoded}`, JWT_SECRET);
    if (signature !== expectedSignature) {
      console.warn('Invalid token signature');
      return null;
    }

    // 페이로드 파싱
    const payload = JSON.parse(base64UrlDecode(payloadEncoded));

    // 만료 시간 확인
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      console.warn('Token expired');
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * 비밀번호 해시 생성 (SHA-256)
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 로그인 검증
 * @param {string} id - 입력된 아이디
 * @param {string} pw - 입력된 비밀번호
 * @returns {Promise<{success: boolean, token?: string, error?: string}>}
 */
export async function login(id, pw) {
  // 환경변수 설정 확인
  if (!ADMIN_ID || !ADMIN_PW_HASH) {
    return {
      success: false,
      error: '관리자 인증 설정이 되어있지 않습니다.'
    };
  }

  // 아이디 확인
  if (id !== ADMIN_ID) {
    return {
      success: false,
      error: '아이디 또는 비밀번호가 올바르지 않습니다.'
    };
  }

  // 비밀번호 확인 (입력값 해시 vs 저장된 해시)
  const inputHash = await hashPassword(pw);

  if (inputHash !== ADMIN_PW_HASH) {
    return {
      success: false,
      error: '아이디 또는 비밀번호가 올바르지 않습니다.'
    };
  }

  // JWT 토큰 생성
  const token = await generateToken(id);

  return {
    success: true,
    token
  };
}

/**
 * 현재 인증 상태 확인
 * @returns {Promise<{isAuthenticated: boolean, userId?: string}>}
 */
export async function checkAuth() {
  const token = localStorage.getItem('authToken');

  if (!token) {
    return { isAuthenticated: false };
  }

  const payload = await verifyToken(token);

  if (!payload) {
    // 유효하지 않은 토큰 제거
    localStorage.removeItem('authToken');
    return { isAuthenticated: false };
  }

  return {
    isAuthenticated: true,
    userId: payload.sub
  };
}

/**
 * 로그아웃
 */
export function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('githubPat');
}

/**
 * 토큰 저장
 */
export function saveToken(token) {
  localStorage.setItem('authToken', token);
}

/**
 * 토큰 가져오기
 */
export function getToken() {
  return localStorage.getItem('authToken');
}
