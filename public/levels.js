// 분노 단계 정의: 웹 페이지와 서버(디스코드 알림)가 함께 사용합니다.
// 구간·사진·색·문구를 바꾸고 싶으면 이 파일만 고치면 됩니다.
// 사진은 public/images/ 안에 있습니다.
(function (root) {
  // 숨겨진 단계: 100을 넘긴 값 (화면에는 ??? 로 표시)
  const HIDDEN_VALUE = 101;

  // max 이하이면 그 단계 (위에서부터 차례로 확인)
  const LEVELS = [
    { max: 10,  stage: 1, image: 'ANGRY-N1.png', color: '#99e550', caption: '내 이름은 신채호! 오늘의 기분은 뭐, 그럭저럭이야!' },
    { max: 25,  stage: 2, image: 'ANGRY-N2.png', color: '#5b6ee1', caption: '오늘 상처받는 말을 들었어, 기분이 별로 안 좋아.' },
    { max: 50,  stage: 3, image: 'ANGRY-N3.png', color: '#b12dbd', caption: '으... 오늘은 나를 건들이지 않았으면 좋겠어...' },
    { max: 75,  stage: 4, image: 'ANGRY-N4.png', color: '#e544a3', caption: '나 지금 기분 나빠, 건들이면 화낼 거다아?' },
    { max: 99,  stage: 5, image: 'ANGRY-N5.png', color: '#ff364a', caption: '야 X발놈아, 뭘 꼬라봐? 의미 없는 비하하지 말라고오!' },
    { max: 100, stage: 6, image: 'ANGRY-N6.png', color: '#ff0000', caption: '우선 X발 나는 흑인이 아니라고, 너 사람 X끼도 아니지?' },
    { max: Infinity, stage: 7, hidden: true, image: 'ANGRY-N7.png', color: '#8a5a3c', bg: '#230e03', caption: '...' },
  ];

  // 정확히 이 값일 때만 나오는 특별 단계
  const SPECIAL = {
    67: { stage: 4, special: true, image: '10th_life.png', color: '#ff0000', caption: '씩~스 쎄븐~~~' },
  };

  function getLevel(value) {
    const v = Math.max(0, Math.min(HIDDEN_VALUE, Number(value) || 0));
    const lv = SPECIAL[v] || LEVELS.find((l) => v <= l.max);
    return { ...lv, bg: lv.bg || lv.color, label: lv.hidden ? '???' : lv.special ? `${v}!!` : `${lv.stage}단계` };
  }

  // 화면에 보여줄 숫자 (100을 넘기면 ???)
  function displayValue(value) {
    return Number(value) > 100 ? '???' : String(value);
  }

  const api = { LEVELS, SPECIAL, HIDDEN_VALUE, getLevel, displayValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AngerLevels = api;
})(typeof window !== 'undefined' ? window : globalThis);
