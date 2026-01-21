import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Settings } from 'lucide-react';

const ADMIN_ID = 'xxonbang';
const GITHUB_REPO = 'xxonbang/check_my_stocks';

function AdminPanel() {
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('adminId') === ADMIN_ID;
  });
  const [inputId, setInputId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = () => {
    if (inputId === ADMIN_ID) {
      localStorage.setItem('adminId', inputId);
      setIsAdmin(true);
      setMessage('');
    } else {
      setMessage('관리자 인증 실패');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminId');
    setIsAdmin(false);
  };

  const triggerAnalysis = async () => {
    const token = prompt('GitHub Personal Access Token을 입력하세요:');
    if (!token) return;

    setIsLoading(true);
    setMessage('');

    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_type: 'manual_analysis',
          }),
        }
      );

      if (response.status === 204) {
        setMessage('분석이 시작되었습니다. 몇 분 후 결과를 확인해주세요.');
      } else {
        throw new Error(`GitHub API error: ${response.status}`);
      }
    } catch (error) {
      setMessage(`오류: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5" />
            관리자 로그인
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              type="password"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="관리자 ID"
              className="flex-1 px-3 py-2 border rounded-md text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <Button onClick={handleLogin} size="sm">
              로그인
            </Button>
          </div>
          {message && <p className="mt-2 text-sm text-red-500">{message}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5" />
            관리자 패널
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button
            onClick={triggerAnalysis}
            disabled={isLoading}
            className="w-full"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? '분석 시작 중...' : '수동 분석 시작'}
          </Button>
          {message && (
            <p className={`text-sm ${message.includes('오류') ? 'text-red-500' : 'text-green-500'}`}>
              {message}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            GitHub Actions를 통해 스크래핑 및 AI 분석을 수동으로 실행합니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminPanel;
