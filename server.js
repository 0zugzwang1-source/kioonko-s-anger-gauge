// 신채호 분노 게이지 서버
// - 웹 페이지 제공 + 실시간 반영(Server-Sent Events)
// - 비밀번호로 게이지 변경 (POST /api/gauge)
// - 디스코드 슬래시 명령 처리 (POST /discord/interactions)
// - 변경될 때마다 디스코드 웹훅으로 알림
// 외부 패키지 없이 Node.js 기본 모듈만 사용합니다.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getLevel } = require('./public/levels.js');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || '';
const DISCORD_OWNER_ID = process.env.DISCORD_OWNER_ID || '';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'gauge.json');
const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const UPSTASH_KEY = 'anger-gauge';
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!ADMIN_PASSWORD) {
  console.warn('[경고] ADMIN_PASSWORD 환경변수가 없어서 웹에서 게이지를 바꿀 수 없습니다.');
}

// ---------------------------------------------------------------- 저장소

let state = { value: Number(process.env.INITIAL_VALUE) || 0, updatedAt: null, by: null };

async function upstash(cmd) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  return (await res.json()).result;
}

async function loadState() {
  try {
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      const raw = await upstash(['GET', UPSTASH_KEY]);
      if (raw) state = { ...state, ...JSON.parse(raw) };
      console.log('[저장소] Upstash Redis에서 불러옴:', state.value);
      return;
    }
    if (fs.existsSync(DATA_FILE)) {
      state = { ...state, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
      console.log('[저장소] 파일에서 불러옴:', state.value);
    }
  } catch (err) {
    console.error('[저장소] 불러오기 실패, 기본값 사용:', err.message);
  }
}

async function saveState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state));
  } catch (err) {
    console.error('[저장소] 파일 저장 실패:', err.message);
  }
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      await upstash(['SET', UPSTASH_KEY, JSON.stringify(state)]);
    } catch (err) {
      console.error('[저장소] Upstash 저장 실패:', err.message);
    }
  }
}

// ---------------------------------------------------------------- 실시간 (SSE)

const clients = new Set();

function broadcast() {
  const data = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) res.write(data);
}

setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25000).unref();

// ---------------------------------------------------------------- 게이지 변경

async function setGauge(value, by) {
  const prev = state.value;
  state = { value, updatedAt: new Date().toISOString(), by };
  await saveState();
  broadcast();
  announce(prev, value, by); // 기다리지 않음 (디스코드 3초 제한 대비)
  return state;
}

function bar(value) {
  const filled = Math.round(value / 10);
  return '🟥'.repeat(filled) + '⬜'.repeat(10 - filled);
}

function announce(prev, value, by) {
  if (!DISCORD_WEBHOOK_URL) return;
  const lv = getLevel(value);
  const arrow = value > prev ? '📈' : value < prev ? '📉' : '➡️';
  const embed = {
    title: `${lv.emoji} 신채호 분노 게이지: ${value} / 100`,
    description: `${bar(value)}\n**[${lv.name}]** ${lv.caption}\n\n${arrow} ${prev} → ${value}`,
    color: parseInt(lv.color.slice(1), 16),
    footer: { text: by === 'discord' ? '디스코드에서 변경' : '웹에서 변경' },
    timestamp: state.updatedAt,
  };
  if (PUBLIC_URL) embed.url = PUBLIC_URL;
  fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '분노 게이지', embeds: [embed] }),
  })
    .then((r) => { if (!r.ok) console.error('[웹훅] 실패:', r.status); })
    .catch((err) => console.error('[웹훅] 실패:', err.message));
}

function parseValue(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

// ---------------------------------------------------------------- 비밀번호 확인

function passwordOk(input) {
  if (!ADMIN_PASSWORD || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

// 비밀번호 무차별 대입 방지: IP당 10분에 10번까지 실패 허용
const failures = new Map();
function tooManyFailures(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.since > 10 * 60 * 1000) { failures.delete(ip); return false; }
  return f.count >= 10;
}
function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.since > 10 * 60 * 1000) failures.set(ip, { count: 1, since: Date.now() });
  else f.count++;
}

// ---------------------------------------------------------------- 디스코드

// 디스코드가 보낸 요청인지 Ed25519 서명으로 확인
function verifyDiscord(rawBody, signature, timestamp) {
  if (!DISCORD_PUBLIC_KEY || !signature || !timestamp) return false;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(DISCORD_PUBLIC_KEY, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, Buffer.concat([Buffer.from(timestamp), rawBody]), key, Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

async function handleInteraction(interaction) {
  if (interaction.type === 1) return { type: 1 }; // PING

  if (interaction.type === 2 && interaction.data?.name === '분노') {
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const opt = interaction.data.options?.find((o) => o.name === '값');
    const lvNow = getLevel(state.value);

    if (!opt) {
      return reply(`${lvNow.emoji} 현재 신채호 분노 게이지: **${state.value} / 100**\n${bar(state.value)}\n**[${lvNow.name}]** ${lvNow.caption}`);
    }
    if (!DISCORD_OWNER_ID || userId !== DISCORD_OWNER_ID) {
      return reply('🚫 이 게이지는 신채호만 바꿀 수 있어요. 남의 분노를 대신 조절하지 마세요!', true);
    }
    const value = parseValue(opt.value);
    if (value === null) return reply('0부터 100 사이 정수로 입력해 주세요.', true);
    await setGauge(value, 'discord');
    const lv = getLevel(value);
    // 채널 알림은 웹훅이 따로 보내므로, 웹훅이 있으면 명령 응답은 본인에게만 보이게 함
    return reply(`${lv.emoji} 분노 게이지를 **${value}** 로 바꿨어요. ${lv.caption}`, Boolean(DISCORD_WEBHOOK_URL));
  }

  return reply('알 수 없는 명령이에요.', true);
}

function reply(content, ephemeral = false) {
  return { type: 4, data: { content, flags: ephemeral ? 64 : 0 } };
}

// ---------------------------------------------------------------- HTTP 서버

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 100_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // 상태 확인 (keep-alive 핑 용)
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });

    if (url.pathname === '/api/gauge' && req.method === 'GET') return sendJson(res, 200, state);

    if (url.pathname === '/api/stream' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`data: ${JSON.stringify(state)}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (url.pathname === '/api/gauge' && req.method === 'POST') {
      const ip = clientIp(req);
      if (tooManyFailures(ip)) return sendJson(res, 429, { error: '비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도하세요.' });
      let body;
      try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch { return sendJson(res, 400, { error: '잘못된 요청' }); }
      if (!passwordOk(body.password)) { recordFailure(ip); return sendJson(res, 401, { error: '비밀번호가 틀렸어요.' }); }
      if (body.checkOnly) return sendJson(res, 200, { ok: true });
      const value = parseValue(body.value);
      if (value === null) return sendJson(res, 400, { error: '0부터 100 사이 정수만 가능해요.' });
      return sendJson(res, 200, await setGauge(value, 'web'));
    }

    if (url.pathname === '/discord/interactions' && req.method === 'POST') {
      const raw = await readBody(req);
      if (!verifyDiscord(raw, req.headers['x-signature-ed25519'], req.headers['x-signature-timestamp'])) {
        res.writeHead(401); return res.end('invalid request signature');
      }
      return sendJson(res, 200, await handleInteraction(JSON.parse(raw.toString('utf8'))));
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const full = path.normalize(path.join(PUBLIC_DIR, file));
      if (full.startsWith(PUBLIC_DIR + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
        return req.method === 'HEAD' ? res.end() : fs.createReadStream(full).pipe(res);
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('없는 페이지예요');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: '서버 오류' });
  }
});

loadState().then(() => {
  server.listen(PORT, () => console.log(`분노 게이지 서버 실행 중: http://localhost:${PORT}`));
});
