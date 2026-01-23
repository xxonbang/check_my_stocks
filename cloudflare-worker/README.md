# Cloudflare Worker - GitHub Actions Proxy

GitHub Actions 워크플로우를 안전하게 트리거하기 위한 Cloudflare Worker 프록시입니다.

## 배포 방법

### 1. Cloudflare 계정 생성
- https://dash.cloudflare.com 에서 무료 계정 생성

### 2. Worker 생성
1. Cloudflare 대시보드 → **Workers & Pages**
2. **Create Worker** 클릭
3. Worker 이름 입력 (예: `github-actions-proxy`)
4. **Deploy** 클릭

### 3. 코드 배포
1. 생성된 Worker 클릭 → **Edit code**
2. `worker.js` 내용을 붙여넣기
3. **Save and Deploy**

### 4. 환경변수 설정
1. Worker 설정 → **Settings** → **Variables**
2. **Add variable** 클릭
3. 다음 변수 추가:

| 변수명 | 값 | 설명 |
|--------|-----|------|
| `GITHUB_PAT` | `ghp_xxxx...` | GitHub Personal Access Token (Actions: Read and write 권한) |
| `ALLOWED_ORIGINS` | `https://your-site.com` | (선택) 허용할 Origin, 여러 개는 콤마로 구분 |

4. **Encrypt** 체크 (PAT 암호화)
5. **Save and Deploy**

### 5. GitHub PAT 생성
1. GitHub → Settings → Developer settings → **Fine-grained tokens**
2. **Generate new token**
3. 설정:
   - Token name: `cloudflare-worker-proxy`
   - Repository access: **Only select repositories** → 대상 레포 선택
   - Permissions:
     - **Actions**: Read and write
     - **Contents**: Read and write (repository_dispatch용)
4. **Generate token** → 토큰 복사

## API 엔드포인트

### 1. Health Check
```
GET /
GET /health
```

### 2. Workflow Dispatch (수동 트리거)
```
POST /trigger-workflow
Content-Type: application/json

{
  "owner": "xxonbang",
  "repo": "check_my_stocks",
  "workflow_id": "daily_analysis.yml",
  "ref": "main",
  "inputs": {}
}
```

### 3. Repository Dispatch (커스텀 이벤트)
```
POST /trigger-dispatch
Content-Type: application/json

{
  "owner": "xxonbang",
  "repo": "check_my_stocks",
  "event_type": "manual_analysis",
  "client_payload": {
    "stock_code": "005930"
  }
}
```

### 4. 워크플로우 상태 조회
```
GET /workflow-status?owner=xxonbang&repo=check_my_stocks&limit=5
```

## 응답 예시

### 성공
```json
{
  "success": true,
  "message": "Workflow dispatch triggered successfully"
}
```

### 실패
```json
{
  "success": false,
  "error": "Not Found",
  "status": 404
}
```

## 앱에서 사용

```javascript
// 환경변수 또는 설정에서 Worker URL 가져오기
const WORKER_URL = 'https://github-actions-proxy.your-account.workers.dev';

async function triggerAnalysis() {
  const response = await fetch(`${WORKER_URL}/trigger-workflow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner: 'xxonbang',
      repo: 'check_my_stocks',
      workflow_id: 'daily_analysis.yml',
      ref: 'main'
    })
  });

  const result = await response.json();
  if (result.success) {
    console.log('분석이 시작되었습니다!');
  }
}
```

## 보안 고려사항

1. **GITHUB_PAT**는 반드시 암호화(Encrypt)하여 저장
2. **ALLOWED_ORIGINS**로 허용된 도메인만 접근 가능하도록 설정
3. Fine-grained token 사용 시 최소 권한 원칙 적용
4. 주기적으로 토큰 갱신

## 무료 플랜 제한

- 일 100,000 요청
- 10ms CPU 시간/요청
- 충분한 용량입니다!
