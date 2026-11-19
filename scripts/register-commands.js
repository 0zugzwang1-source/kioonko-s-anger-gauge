// 디스코드에 /분노 슬래시 명령을 등록합니다. (처음 한 번, 또는 명령을 바꿨을 때만 실행)
// 필요한 환경변수: DISCORD_APP_ID, DISCORD_BOT_TOKEN
// 선택: DISCORD_GUILD_ID (넣으면 그 서버에만 즉시 등록, 빼면 전체 등록이라 반영에 최대 1시간)

const { DISCORD_APP_ID, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_APP_ID || !DISCORD_BOT_TOKEN) {
  console.error('DISCORD_APP_ID 와 DISCORD_BOT_TOKEN 환경변수가 필요해요.');
  process.exit(1);
}

const commands = [
  {
    name: '분노',
    description: '신채호 분노 게이지를 확인하거나 바꿉니다 (변경은 신채호만 가능)',
    type: 1,
    options: [
      { name: '값', description: '0~100 사이 분노 수치 (비우면 현재 값 확인)', type: 4, required: false, min_value: 0, max_value: 100 },
    ],
  },
];

const url = DISCORD_GUILD_ID
  ? `https://discord.com/api/v10/applications/${DISCORD_APP_ID}/guilds/${DISCORD_GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${DISCORD_APP_ID}/commands`;

fetch(url, {
  method: 'PUT',
  headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands),
}).then(async (res) => {
  if (res.ok) {
    console.log(`✅ /분노 명령 등록 완료 (${DISCORD_GUILD_ID ? '서버 전용' : '전체'})`);
  } else {
    console.error('❌ 등록 실패:', res.status, await res.text());
    process.exit(1);
  }
});
