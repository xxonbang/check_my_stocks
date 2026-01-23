import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Eye, EyeOff, Info } from 'lucide-react';

function LoginModal({ onLogin, onClose, savedPat = '' }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [pat, setPat] = useState(savedPat);
  const [showPat, setShowPat] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await onLogin(id, pw, pat);
      if (!result.success) {
        setError(result.error || '아이디 또는 비밀번호가 올바르지 않습니다.');
      }
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-sm sm:max-w-md">
        <CardHeader className="relative pb-2">
          <CardTitle className="text-base sm:text-lg pr-8">관리자 로그인</CardTitle>
          <button
            onClick={onClose}
            className="absolute right-3 top-3 sm:right-4 sm:top-4 text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium mb-1">아이디</label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="아이디를 입력하세요"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium mb-1">비밀번호</label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="비밀번호를 입력하세요"
              />
            </div>

            {/* GitHub PAT 입력 */}
            <div className="pt-2 border-t">
              <label className="block text-xs sm:text-sm font-medium mb-1">
                GitHub PAT
                <span className="text-muted-foreground font-normal ml-1">(선택)</span>
              </label>
              <div className="relative">
                <input
                  type={showPat ? 'text' : 'password'}
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border rounded-md text-sm font-mono"
                  placeholder="ghp_xxxx..."
                />
                <button
                  type="button"
                  onClick={() => setShowPat(!showPat)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPat ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-start gap-1 mt-1.5 text-xs text-muted-foreground">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>입력 시 분석 자동 시작 가능 (Actions 권한 필요)</span>
              </div>
            </div>

            {error && <p className="text-xs sm:text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? '로그인 중...' : '로그인'}
              </Button>
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                취소
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default LoginModal;
