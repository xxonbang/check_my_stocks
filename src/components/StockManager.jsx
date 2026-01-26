import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Plus, Pencil, Trash2, X, Check, Loader2, AlertCircle, Search
} from 'lucide-react';
import {
  getCurrentStockList,
  addStockToList,
  updateStockInList,
  deleteStockFromList,
  searchStocks,
  getStockDetail
} from '@/lib/stockApi';

function StockManager({ githubToken, githubRepo }) {
  const [stocks, setStocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // 추가 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [isAdding, setIsAdding] = useState(false);

  // 수정 상태
  const [editingCode, setEditingCode] = useState(null);
  const [editForm, setEditForm] = useState({ code: '', name: '' });
  const [isUpdating, setIsUpdating] = useState(false);

  // 삭제 확인 상태
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 메시지
  const [message, setMessage] = useState(null);

  // 종목 목록 로드
  const loadStocks = async () => {
    setIsLoading(true);
    try {
      const stockList = await getCurrentStockList();
      setStocks(stockList);
      setError(null);
    } catch (err) {
      setError('종목 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStocks();
  }, []);

  // 메시지 표시 후 자동 숨김
  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  // 종목 검색
  const handleSearch = async () => {
    if (!searchKeyword.trim()) return;

    setIsSearching(true);
    setSearchResults([]);
    setSelectedStock(null);

    try {
      const results = await searchStocks(searchKeyword.trim());
      setSearchResults(results);
      if (results.length === 0) {
        showMessage('검색 결과가 없습니다.', 'error');
      }
    } catch (err) {
      showMessage('검색 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  // 종목 선택
  const handleSelectStock = async (stock) => {
    try {
      const detail = await getStockDetail(stock.code);
      setSelectedStock({ ...stock, ...detail });
    } catch (err) {
      setSelectedStock(stock);
    }
  };

  // 종목 추가
  const handleAdd = async () => {
    if (!selectedStock || !githubToken) return;

    // 중복 체크
    if (stocks.some(s => s.code === selectedStock.code)) {
      showMessage('이미 등록된 종목입니다.', 'error');
      return;
    }

    setIsAdding(true);
    try {
      await addStockToList(
        selectedStock.code,
        selectedStock.name,
        githubToken,
        githubRepo
      );
      showMessage(`${selectedStock.name} 종목이 추가되었습니다.`);
      setShowAddModal(false);
      setSearchKeyword('');
      setSearchResults([]);
      setSelectedStock(null);
      await loadStocks();
    } catch (err) {
      showMessage(err.message || '종목 추가에 실패했습니다.', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  // 수정 시작
  const startEdit = (stock) => {
    setEditingCode(stock.code);
    setEditForm({ code: stock.code, name: stock.name });
  };

  // 수정 취소
  const cancelEdit = () => {
    setEditingCode(null);
    setEditForm({ code: '', name: '' });
  };

  // 수정 저장
  const handleUpdate = async () => {
    if (!editForm.code.trim() || !editForm.name.trim() || !githubToken) return;

    setIsUpdating(true);
    try {
      await updateStockInList(
        editingCode,
        editForm.code.trim(),
        editForm.name.trim(),
        githubToken,
        githubRepo
      );
      showMessage('종목이 수정되었습니다.');
      cancelEdit();
      await loadStocks();
    } catch (err) {
      showMessage(err.message || '종목 수정에 실패했습니다.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  // 삭제 확인
  const confirmDelete = (stock) => {
    setDeleteConfirm(stock);
  };

  // 삭제 실행
  const handleDelete = async () => {
    if (!deleteConfirm || !githubToken) return;

    setIsDeleting(true);
    try {
      await deleteStockFromList(
        deleteConfirm.code,
        githubToken,
        githubRepo
      );
      showMessage(`${deleteConfirm.name} 종목이 삭제되었습니다.`);
      setDeleteConfirm(null);
      await loadStocks();
    } catch (err) {
      showMessage(err.message || '종목 삭제에 실패했습니다.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!githubToken) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
            <p>종목 관리를 위해서는 GitHub PAT가 필요합니다.</p>
            <p className="text-sm mt-2">로그인 시 PAT를 입력해주세요.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 메시지 */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === 'error'
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* 헤더 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">보유 종목 관리</CardTitle>
            <Button onClick={() => setShowAddModal(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              종목 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center text-red-500 py-4">{error}</div>
          ) : stocks.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              등록된 종목이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {stocks.map((stock, index) => (
                <div
                  key={stock.code}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50"
                >
                  {editingCode === stock.code ? (
                    // 수정 모드
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editForm.code}
                        onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                        className="w-24 px-2 py-1 border rounded text-sm"
                        placeholder="종목코드"
                      />
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                        placeholder="종목명"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleUpdate}
                        disabled={isUpdating}
                      >
                        {isUpdating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4 text-green-600" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={isUpdating}
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ) : (
                    // 보기 모드
                    <>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-6">{index + 1}</span>
                        <div>
                          <span className="font-medium">{stock.name}</span>
                          <span className="text-sm text-muted-foreground ml-2">({stock.code})</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(stock)}
                        >
                          <Pencil className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => confirmDelete(stock)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 종목 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="relative pb-2">
              <CardTitle className="text-lg pr-8">종목 추가</CardTitle>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSearchKeyword('');
                  setSearchResults([]);
                  setSelectedStock(null);
                }}
                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 검색 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1 px-3 py-2 border rounded-md text-sm"
                  placeholder="종목명 검색 (예: 삼성전자)"
                />
                <Button onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* 검색 결과 */}
              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto border rounded-md">
                  {searchResults.map((stock) => {
                    const isExisting = stocks.some(s => s.code === stock.code);
                    return (
                      <div
                        key={stock.code}
                        onClick={() => !isExisting && handleSelectStock(stock)}
                        className={`p-2 border-b last:border-b-0 ${
                          isExisting
                            ? 'bg-slate-100 cursor-not-allowed'
                            : selectedStock?.code === stock.code
                              ? 'bg-blue-50'
                              : 'hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-sm">{stock.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">({stock.code})</span>
                          </div>
                          {isExisting && (
                            <span className="text-xs text-muted-foreground">등록됨</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 선택된 종목 */}
              {selectedStock && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-800">선택된 종목</p>
                  <p className="text-lg font-semibold">{selectedStock.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedStock.code}</p>
                  {selectedStock.currentPrice && (
                    <p className="text-sm mt-1">
                      현재가: {selectedStock.currentPrice.toLocaleString()}원
                    </p>
                  )}
                </div>
              )}

              {/* 추가 버튼 */}
              <Button
                onClick={handleAdd}
                disabled={!selectedStock || isAdding}
                className="w-full"
              >
                {isAdding ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                종목 추가
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-red-600">종목 삭제</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                <strong>{deleteConfirm.name}</strong> ({deleteConfirm.code})
                <br />
                종목을 삭제하시겠습니까?
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  variant="destructive"
                  className="flex-1"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  삭제
                </Button>
                <Button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isDeleting}
                  variant="outline"
                  className="flex-1"
                >
                  취소
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default StockManager;
