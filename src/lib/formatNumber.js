// 숫자에 3자리마다 콤마 추가
export const addCommas = (numStr) => {
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 큰 숫자를 한국식 단위로 축약 (조, 억, 천만, 백만)
export const abbreviateKorean = (num) => {
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1_000_000_000_000) {
    // 조 단위 (1조 이상)
    const jo = absNum / 1_000_000_000_000;
    if (jo >= 10) {
      return sign + Math.round(jo).toLocaleString() + '조';
    }
    return sign + jo.toFixed(1).replace(/\.0$/, '') + '조';
  } else if (absNum >= 100_000_000) {
    // 억 단위 (1억 이상)
    const eok = absNum / 100_000_000;
    if (eok >= 100) {
      return sign + Math.round(eok).toLocaleString() + '억';
    } else if (eok >= 10) {
      return sign + Math.round(eok) + '억';
    }
    return sign + eok.toFixed(1).replace(/\.0$/, '') + '억';
  } else if (absNum >= 10_000_000) {
    // 천만 단위 (1000만 이상)
    const cheonman = absNum / 10_000_000;
    return sign + cheonman.toFixed(1).replace(/\.0$/, '') + '천만';
  } else if (absNum >= 1_000_000) {
    // 백만 단위 (100만 이상)
    const baekman = absNum / 1_000_000;
    return sign + baekman.toFixed(1).replace(/\.0$/, '') + '백만';
  }

  // 100만 미만은 콤마 포맷팅만 적용
  return sign + addCommas(Math.round(absNum).toString());
};

// 달러 단위 축약
export const abbreviateDollar = (num) => {
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1_000_000_000_000) {
    return sign + '$' + (absNum / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '') + 'T';
  } else if (absNum >= 1_000_000_000) {
    return sign + '$' + (absNum / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  } else if (absNum >= 1_000_000) {
    return sign + '$' + (absNum / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  } else if (absNum >= 1_000) {
    return sign + '$' + (absNum / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return sign + '$' + addCommas(Math.round(absNum).toString());
};

// 통합 포맷팅 함수
export const formatValue = (value) => {
  if (value === null || value === undefined || value === 'N/A' || value === '') return '-';

  const str = String(value).trim();

  // 이미 한국식 단위가 포함된 경우 그대로 반환
  if (/[조억]/.test(str) && !/^\d/.test(str.replace(/[,.\d\s조억천백만원달러$+-]/g, ''))) {
    return str;
  }

  // 퍼센트 값은 그대로 반환
  if (str.includes('%')) {
    return str;
  }

  // 문자열에서 숫자 추출 시도
  // 콤마 제거하고 숫자 파싱
  const cleanStr = str.replace(/,/g, '');

  // 달러 표시 확인
  const isDollar = str.includes('$') || str.toLowerCase().includes('달러');

  // 숫자 + 선택적 단위 매칭 (예: "5210900000000", "+433048", "24,772", "$100")
  const numMatch = cleanStr.match(/^([+-]?)[$]?(\d+)(\.\d+)?(.*)$/);

  if (numMatch) {
    const sign = numMatch[1] || '';
    const intPart = numMatch[2];
    const decPart = numMatch[3] || '';
    const suffix = numMatch[4] || '';

    const num = parseFloat(sign + intPart + decPart);

    if (isNaN(num)) return str;

    // 큰 숫자 축약 (100만 이상)
    if (Math.abs(num) >= 1_000_000) {
      if (isDollar) {
        return abbreviateDollar(num) + suffix;
      }
      return abbreviateKorean(num) + suffix;
    }

    // 100만 미만은 콤마 포맷팅
    const formatted = addCommas(intPart);
    return sign + formatted + decPart + suffix;
  }

  // 단순 숫자 문자열 (콤마 없이)
  if (/^[+-]?\d+$/.test(cleanStr)) {
    const num = parseInt(cleanStr, 10);
    if (Math.abs(num) >= 1_000_000) {
      return abbreviateKorean(num);
    }
    return addCommas(cleanStr.replace(/^([+-]?)/, '$1'));
  }

  return str;
};

export default formatValue;
