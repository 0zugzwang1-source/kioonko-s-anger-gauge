// 분노 단계 정의: 웹 페이지와 서버(디스코드 알림)가 함께 사용합니다.
// 구간·색·문구를 바꾸고 싶으면 이 파일만 고치면 됩니다.
(function (root) {
  const LEVELS = [
    { max: 10,  emoji: '🍵', name: '평온',     color: '#22c55e', caption: '신채호 지금 평화로움. 차 한 잔 하는 중' },
    { max: 30,  emoji: '🙂', name: '멀쩡',     color: '#84cc16', caption: '아직은 웃고 있음. 아직은.' },
    { max: 50,  emoji: '😑', name: '심기불편', color: '#eab308', caption: '슬슬 표정이 굳어가는 중...' },
    { max: 70,  emoji: '😤', name: '짜증',     color: '#f97316', caption: '말 걸 때 조심하세요. 진심입니다' },
    { max: 90,  emoji: '🤬', name: '분노',     color: '#ef4444', caption: '폭발 직전! 주변 인원 대피 권장' },
    { max: 100, emoji: '🌋', name: '대폭발',   color: '#b91c1c', caption: '폭발!!! 모두 도망쳐!!!' },
  ];

  function getLevel(value) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    return LEVELS.find((l) => v <= l.max) || LEVELS[LEVELS.length - 1];
  }

  const api = { LEVELS, getLevel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AngerLevels = api;
})(typeof window !== 'undefined' ? window : globalThis);
