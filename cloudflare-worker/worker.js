/**
 * Cloudflare Worker - GitHub Actions Workflow Trigger Proxy
 *
 * 이 Worker는 GitHub API에 대한 프록시 역할을 합니다.
 * PAT(Personal Access Token)를 환경변수에 안전하게 보관하고,
 * 클라이언트의 요청을 GitHub API로 전달합니다.
 *
 * 배포 방법:
 * 1. Cloudflare 대시보드 → Workers & Pages → Create Worker
 * 2. 이 코드를 붙여넣기
 * 3. Settings → Variables → GITHUB_PAT 환경변수 추가
 * 4. Settings → Variables → ALLOWED_ORIGINS 환경변수 추가 (선택)
 * 5. Save and Deploy
 */

// CORS 헤더
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

// 허용된 GitHub API 엔드포인트 (보안)
const ALLOWED_ENDPOINTS = [
  '/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
  '/repos/{owner}/{repo}/dispatches',
  '/repos/{owner}/{repo}/actions/runs',
];

export default {
  async fetch(request, env, ctx) {
    // CORS preflight 처리
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Origin 검증 (선택적)
    const origin = request.headers.get('Origin');
    if (env.ALLOWED_ORIGINS) {
      const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
      if (origin && !allowedOrigins.includes(origin) && !allowedOrigins.includes('*')) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Health check
      if (path === '/' || path === '/health') {
        return new Response(JSON.stringify({ status: 'ok', service: 'github-actions-proxy' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // API 엔드포인트: /trigger-workflow
      if (path === '/trigger-workflow' && request.method === 'POST') {
        return await handleTriggerWorkflow(request, env);
      }

      // API 엔드포인트: /trigger-dispatch
      if (path === '/trigger-dispatch' && request.method === 'POST') {
        return await handleRepositoryDispatch(request, env);
      }

      // API 엔드포인트: /workflow-status
      if (path === '/workflow-status' && request.method === 'GET') {
        return await handleWorkflowStatus(request, env);
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

/**
 * workflow_dispatch 이벤트 트리거
 * POST /trigger-workflow
 * Body: { owner, repo, workflow_id, ref, inputs }
 */
async function handleTriggerWorkflow(request, env) {
  const { owner, repo, workflow_id, ref = 'main', inputs = {} } = await request.json();

  if (!owner || !repo || !workflow_id) {
    return new Response(JSON.stringify({ error: 'Missing required fields: owner, repo, workflow_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!env.GITHUB_PAT) {
    return new Response(JSON.stringify({ error: 'GITHUB_PAT not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const githubUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`;

  const response = await fetch(githubUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_PAT}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'CloudflareWorker-GitHubProxy',
    },
    body: JSON.stringify({ ref, inputs }),
  });

  if (response.status === 204) {
    return new Response(JSON.stringify({
      success: true,
      message: 'Workflow dispatch triggered successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const errorText = await response.text();
  return new Response(JSON.stringify({
    success: false,
    error: errorText,
    status: response.status
  }), {
    status: response.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * repository_dispatch 이벤트 트리거
 * POST /trigger-dispatch
 * Body: { owner, repo, event_type, client_payload }
 */
async function handleRepositoryDispatch(request, env) {
  const { owner, repo, event_type, client_payload = {} } = await request.json();

  if (!owner || !repo || !event_type) {
    return new Response(JSON.stringify({ error: 'Missing required fields: owner, repo, event_type' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!env.GITHUB_PAT) {
    return new Response(JSON.stringify({ error: 'GITHUB_PAT not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const githubUrl = `https://api.github.com/repos/${owner}/${repo}/dispatches`;

  const response = await fetch(githubUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_PAT}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'CloudflareWorker-GitHubProxy',
    },
    body: JSON.stringify({ event_type, client_payload }),
  });

  if (response.status === 204) {
    return new Response(JSON.stringify({
      success: true,
      message: 'Repository dispatch triggered successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const errorText = await response.text();
  return new Response(JSON.stringify({
    success: false,
    error: errorText,
    status: response.status
  }), {
    status: response.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * 워크플로우 실행 상태 조회
 * GET /workflow-status?owner=xxx&repo=xxx&limit=5
 */
async function handleWorkflowStatus(request, env) {
  const url = new URL(request.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');
  const limit = url.searchParams.get('limit') || '5';

  if (!owner || !repo) {
    return new Response(JSON.stringify({ error: 'Missing required params: owner, repo' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!env.GITHUB_PAT) {
    return new Response(JSON.stringify({ error: 'GITHUB_PAT not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const githubUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=${limit}`;

  const response = await fetch(githubUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_PAT}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CloudflareWorker-GitHubProxy',
    },
  });

  const data = await response.json();

  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
