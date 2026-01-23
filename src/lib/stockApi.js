// 네이버 금융 API 연동
// 자동완성 API (CORS 프록시 필요)
const NAVER_AC_URL = 'https://ac.stock.naver.com/ac';
const NAVER_BASIC_URL = 'https://m.stock.naver.com/api/stock';
const CORS_PROXY = 'https://corsproxy.io/?';

/**
 * 종목명으로 검색 (자동완성 API 사용)
 * @param {string} keyword - 검색할 종목명
 * @returns {Promise<Array>} - 검색 결과 목록
 */
export async function searchStocks(keyword) {
  try {
    const targetUrl = `${NAVER_AC_URL}?q=${encodeURIComponent(keyword)}&target=stock`;
    const response = await fetch(`${CORS_PROXY}${targetUrl}`);

    if (!response.ok) {
      throw new Error('검색 요청에 실패했습니다.');
    }

    const text = await response.text();
    if (text.trim().startsWith('<')) {
      throw new Error('검색 서비스에 접근할 수 없습니다.');
    }

    const data = JSON.parse(text);
    const items = data.items || [];

    return items.map(item => ({
      code: item.code,
      name: item.name,
      market: item.typeName || '',
      stockType: item.category || ''
    }));
  } catch (error) {
    console.error('종목 검색 오류:', error);
    throw error;
  }
}

/**
 * 종목 상세 정보 조회
 * @param {string} code - 종목 코드
 * @returns {Promise<Object>} - 종목 상세 정보
 */
export async function getStockDetail(code) {
  try {
    const targetUrl = `${NAVER_BASIC_URL}/${code}/basic`;
    const response = await fetch(`${CORS_PROXY}${targetUrl}`);

    if (!response.ok) {
      throw new Error('종목 정보를 가져올 수 없습니다.');
    }

    const text = await response.text();
    if (text.trim().startsWith('<')) {
      throw new Error('종목 정보 서비스에 접근할 수 없습니다.');
    }

    const data = JSON.parse(text);

    // API가 콤마 포함 문자열을 반환하므로 콤마 제거 후 숫자로 변환
    const parsePrice = (val) => {
      if (!val) return 0;
      const num = parseFloat(String(val).replace(/,/g, ''));
      return isNaN(num) ? 0 : num;
    };

    return {
      code: code,
      name: data.stockName || data.stockNameEng || '',
      currentPrice: parsePrice(data.closePrice || data.now),
      changePrice: parsePrice(data.compareToPreviousClosePrice || data.diff),
      changeRate: parseFloat(data.fluctuationsRatio || data.rate || 0),
      highPrice: parsePrice(data.highPrice),
      lowPrice: parsePrice(data.lowPrice),
      openPrice: parsePrice(data.openPrice),
      volume: parsePrice(data.accumulatedTradingVolume),
      marketCap: parsePrice(data.marketCap),
      isValid: true
    };
  } catch (error) {
    console.error('종목 상세 정보 조회 오류:', error);
    throw error;
  }
}

/**
 * stocks.json에 종목 추가 (GitHub API 사용)
 * @param {string} code - 종목 코드
 * @param {string} name - 종목명
 * @param {string} token - GitHub 토큰
 * @param {string} repo - GitHub 레포지토리 (owner/repo)
 * @returns {Promise<boolean>} - 성공 여부
 */
export async function addStockToList(code, name, token, repo) {
  try {
    // 1. 현재 stocks.json 내용 가져오기
    const getResponse = await fetch(
      `https://api.github.com/repos/${repo}/contents/data/stocks.json`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!getResponse.ok) {
      throw new Error('stocks.json을 가져올 수 없습니다.');
    }

    const fileData = await getResponse.json();
    const currentContent = JSON.parse(atob(fileData.content));

    // 2. 중복 체크
    const isDuplicate = currentContent.stocks.some(
      stock => stock.code === code
    );

    if (isDuplicate) {
      throw new Error('이미 분석 목록에 존재하는 종목입니다.');
    }

    // 3. 새 종목 추가
    currentContent.stocks.push({ code, name });

    // 4. GitHub API로 파일 업데이트
    const updateResponse = await fetch(
      `https://api.github.com/repos/${repo}/contents/data/stocks.json`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Add stock: ${name} (${code})`,
          content: btoa(unescape(encodeURIComponent(JSON.stringify(currentContent, null, 2) + '\n'))),
          sha: fileData.sha
        })
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(errorData.message || '종목 추가에 실패했습니다.');
    }

    return true;
  } catch (error) {
    console.error('종목 추가 오류:', error);
    throw error;
  }
}

/**
 * 현재 stocks.json에서 종목 목록 가져오기
 * @returns {Promise<Array>} - 종목 목록
 */
export async function getCurrentStockList() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/stocks.json`);

    if (!response.ok) {
      throw new Error('stocks.json을 가져올 수 없습니다.');
    }

    const data = await response.json();
    return data.stocks || [];
  } catch (error) {
    console.error('종목 목록 조회 오류:', error);
    return [];
  }
}

// ============================================
// GitHub Actions 워크플로우 트리거 기능
// ============================================

/**
 * 트리거 방식 설정
 * - 'pat': GitHub PAT 직접 사용 (방법 1)
 * - 'proxy': Cloudflare Worker 프록시 사용 (방법 2)
 */
const TRIGGER_METHOD = 'pat'; // 'pat' 또는 'proxy'

// Cloudflare Worker URL (방법 2 사용 시 설정)
const WORKER_PROXY_URL = ''; // 예: 'https://github-actions-proxy.your-account.workers.dev'

/**
 * GitHub Actions workflow_dispatch 트리거 (방법 1: PAT 직접 사용)
 * @param {Object} options
 * @param {string} options.owner - 레포지토리 소유자
 * @param {string} options.repo - 레포지토리 이름
 * @param {string} options.workflowId - 워크플로우 파일명 또는 ID
 * @param {string} options.ref - 브랜치 (기본: main)
 * @param {Object} options.inputs - 워크플로우 inputs (선택)
 * @param {string} options.token - GitHub PAT
 * @returns {Promise<Object>} - 결과
 */
export async function triggerWorkflowWithPAT({ owner, repo, workflowId, ref = 'main', inputs = {}, token }) {
  if (!token) {
    throw new Error('GitHub PAT가 필요합니다.');
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs }),
    });

    if (response.status === 204) {
      return { success: true, message: '워크플로우가 시작되었습니다.' };
    }

    const errorText = await response.text();
    let errorMessage = '워크플로우 트리거에 실패했습니다.';

    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorMessage;
    } catch (e) {
      // JSON 파싱 실패 시 기본 메시지 사용
    }

    // 403 오류 시 권한 안내
    if (response.status === 403) {
      errorMessage = 'PAT 권한이 부족합니다. GitHub에서 토큰의 "Actions: Read and write" 권한을 확인해주세요.';
    }

    throw new Error(errorMessage);
  } catch (error) {
    console.error('워크플로우 트리거 오류:', error);
    throw error;
  }
}

/**
 * GitHub Actions workflow_dispatch 트리거 (방법 2: Cloudflare Worker 프록시)
 * @param {Object} options
 * @param {string} options.owner - 레포지토리 소유자
 * @param {string} options.repo - 레포지토리 이름
 * @param {string} options.workflowId - 워크플로우 파일명 또는 ID
 * @param {string} options.ref - 브랜치 (기본: main)
 * @param {Object} options.inputs - 워크플로우 inputs (선택)
 * @returns {Promise<Object>} - 결과
 */
export async function triggerWorkflowWithProxy({ owner, repo, workflowId, ref = 'main', inputs = {} }) {
  if (!WORKER_PROXY_URL) {
    throw new Error('Cloudflare Worker URL이 설정되지 않았습니다.');
  }

  try {
    const response = await fetch(`${WORKER_PROXY_URL}/trigger-workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner,
        repo,
        workflow_id: workflowId,
        ref,
        inputs,
      }),
    });

    const result = await response.json();

    if (result.success) {
      return { success: true, message: '워크플로우가 시작되었습니다.' };
    }

    throw new Error(result.error || '워크플로우 트리거에 실패했습니다.');
  } catch (error) {
    console.error('워크플로우 트리거 오류:', error);
    throw error;
  }
}

/**
 * GitHub Actions 워크플로우 트리거 (통합 함수)
 * 설정된 방식(PAT 또는 프록시)에 따라 자동으로 적절한 방법 사용
 * @param {Object} options
 * @param {string} options.owner - 레포지토리 소유자
 * @param {string} options.repo - 레포지토리 이름
 * @param {string} options.workflowId - 워크플로우 파일명 또는 ID
 * @param {string} options.ref - 브랜치 (기본: main)
 * @param {Object} options.inputs - 워크플로우 inputs (선택)
 * @param {string} options.token - GitHub PAT (방법 1 사용 시 필수)
 * @returns {Promise<Object>} - 결과
 */
export async function triggerWorkflow(options) {
  if (TRIGGER_METHOD === 'proxy' && WORKER_PROXY_URL) {
    return triggerWorkflowWithProxy(options);
  }
  return triggerWorkflowWithPAT(options);
}

/**
 * GitHub Actions 워크플로우 실행 상태 조회
 * @param {Object} options
 * @param {string} options.owner - 레포지토리 소유자
 * @param {string} options.repo - 레포지토리 이름
 * @param {string} options.token - GitHub PAT
 * @param {number} options.limit - 조회할 개수 (기본: 5)
 * @returns {Promise<Array>} - 워크플로우 실행 목록
 */
export async function getWorkflowRuns({ owner, repo, token, limit = 5 }) {
  if (!token) {
    throw new Error('GitHub PAT가 필요합니다.');
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=${limit}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error('워크플로우 상태 조회에 실패했습니다.');
    }

    const data = await response.json();

    return (data.workflow_runs || []).map(run => ({
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      createdAt: run.created_at,
      runStartedAt: run.run_started_at,
      updatedAt: run.updated_at,
      htmlUrl: run.html_url,
    }));
  } catch (error) {
    console.error('워크플로우 상태 조회 오류:', error);
    throw error;
  }
}

/**
 * 특정 워크플로우 실행 상태 조회
 * @param {Object} options
 * @param {string} options.owner - 레포지토리 소유자
 * @param {string} options.repo - 레포지토리 이름
 * @param {number} options.runId - 워크플로우 실행 ID
 * @param {string} options.token - GitHub PAT
 * @returns {Promise<Object>} - 워크플로우 실행 정보
 */
export async function getWorkflowRunById({ owner, repo, runId, token }) {
  if (!token) {
    throw new Error('GitHub PAT가 필요합니다.');
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error('워크플로우 상태 조회에 실패했습니다.');
    }

    const run = await response.json();

    return {
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      createdAt: run.created_at,
      runStartedAt: run.run_started_at,
      updatedAt: run.updated_at,
      htmlUrl: run.html_url,
    };
  } catch (error) {
    console.error('워크플로우 상태 조회 오류:', error);
    throw error;
  }
}

/**
 * 완료된 워크플로우들의 평균 소요 시간 계산 (초 단위)
 * @param {Object} options
 * @param {string} options.owner - 레포지토리 소유자
 * @param {string} options.repo - 레포지토리 이름
 * @param {string} options.token - GitHub PAT
 * @param {string} options.workflowName - 워크플로우 이름 (선택, 필터링용)
 * @returns {Promise<number>} - 평균 소요 시간 (초)
 */
export async function getAverageWorkflowDuration({ owner, repo, token, workflowName = null }) {
  try {
    const runs = await getWorkflowRuns({ owner, repo, token, limit: 10 });

    // 완료된 워크플로우만 필터링
    let completedRuns = runs.filter(run =>
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      run.runStartedAt
    );

    // 워크플로우 이름으로 필터링 (선택)
    if (workflowName) {
      completedRuns = completedRuns.filter(run => run.name === workflowName);
    }

    if (completedRuns.length === 0) {
      // 기본값: 3분 (180초)
      return 180;
    }

    // 소요 시간 계산
    const durations = completedRuns.map(run => {
      const start = new Date(run.runStartedAt).getTime();
      const end = new Date(run.updatedAt).getTime();
      return (end - start) / 1000; // 초 단위
    });

    // 평균 계산
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    return Math.round(avgDuration);
  } catch (error) {
    console.error('평균 소요 시간 계산 오류:', error);
    // 오류 시 기본값 반환
    return 180;
  }
}

/**
 * 현재 최신 워크플로우 ID 가져오기 (트리거 전에 호출)
 * @param {Object} options
 * @param {string} options.owner - 레포지토리 소유자
 * @param {string} options.repo - 레포지토리 이름
 * @param {string} options.token - GitHub PAT
 * @returns {Promise<number|null>} - 최신 워크플로우 ID 또는 null
 */
export async function getLatestRunId({ owner, repo, token }) {
  try {
    const runs = await getWorkflowRuns({ owner, repo, token, limit: 1 });
    if (runs.length > 0) {
      return runs[0].id;
    }
  } catch (e) {
    // 무시
  }
  return null;
}

/**
 * 가장 최근에 시작된 워크플로우 찾기 (트리거 직후 호출)
 * @param {Object} options
 * @param {string} options.owner - 레포지토리 소유자
 * @param {string} options.repo - 레포지토리 이름
 * @param {string} options.token - GitHub PAT
 * @param {number|null} options.lastKnownRunId - 트리거 전 최신 워크플로우 ID
 * @param {number} options.maxWaitMs - 최대 대기 시간 (기본: 30초)
 * @param {number} options.pollIntervalMs - 폴링 간격 (기본: 3초)
 * @returns {Promise<Object|null>} - 워크플로우 실행 정보 또는 null
 */
export async function findLatestWorkflowRun({ owner, repo, token, lastKnownRunId = null, maxWaitMs = 30000, pollIntervalMs = 3000 }) {
  const triggerTime = Date.now();

  // 새 워크플로우가 나타날 때까지 폴링
  let pollCount = 0;
  const maxPolls = Math.ceil(maxWaitMs / pollIntervalMs);

  while (pollCount < maxPolls) {
    pollCount++;

    try {
      const runs = await getWorkflowRuns({ owner, repo, token, limit: 5 });

      // 새로운 워크플로우 찾기:
      // 1. 이전에 알던 ID와 다른 것
      // 2. 또는 트리거 이후에 생성된 것 (createdAt 기준)
      const newRun = runs.find(run => {
        const createdAt = new Date(run.createdAt).getTime();
        const isNew = run.id !== lastKnownRunId;
        const isRecent = createdAt > (triggerTime - 60000); // 트리거 1분 전 이후

        // lastKnownRunId가 있으면 ID 비교, 없으면 시간으로 비교
        if (lastKnownRunId) {
          return isNew;
        }
        return isRecent;
      });

      if (newRun) {
        return newRun;
      }
    } catch (e) {
      console.error('워크플로우 검색 오류:', e);
    }

    // 마지막 폴링이 아니면 대기
    if (pollCount < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  return null;
}

/**
 * 워크플로우 완료까지 상태 폴링
 * @param {Object} options
 * @param {string} options.owner - 레포지토리 소유자
 * @param {string} options.repo - 레포지토리 이름
 * @param {number} options.runId - 워크플로우 실행 ID
 * @param {string} options.token - GitHub PAT
 * @param {number} options.pollIntervalMs - 폴링 간격 (기본: 10초)
 * @param {number} options.maxWaitMs - 최대 대기 시간 (기본: 10분)
 * @param {function} options.onProgress - 진행 상태 콜백 (선택)
 * @returns {Promise<Object>} - 최종 워크플로우 실행 정보
 */
export async function pollWorkflowUntilComplete({
  owner,
  repo,
  runId,
  token,
  pollIntervalMs = 10000,
  maxWaitMs = 600000,
  onProgress = null
}) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const run = await getWorkflowRunById({ owner, repo, runId, token });

      // 진행 콜백 호출
      if (onProgress) {
        const elapsedMs = Date.now() - startTime;
        onProgress({
          status: run.status,
          conclusion: run.conclusion,
          elapsedMs,
          run,
        });
      }

      // 완료 체크
      if (run.status === 'completed') {
        return run;
      }
    } catch (e) {
      console.error('폴링 오류:', e);
    }

    // 대기
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('워크플로우 완료 대기 시간 초과');
}
