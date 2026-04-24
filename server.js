require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// 필수 환경변수 검증
const REQUIRED_ENV = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error('[FATAL] 누락된 환경변수:', missingEnv.join(', '));
  console.error('  → .env 파일을 확인하거나 Railway 환경변수를 설정해주세요.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

process.on('uncaughtException',  err    => console.error('[uncaughtException]',  err));
process.on('unhandledRejection', reason => console.error('[unhandledRejection]', reason));

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

const STYLE_GUIDE = {
  '기본':    '자연스러운 문장형으로 작성해.',
  '개조식':  [
    '[개조식 스타일 규칙 - 반드시 준수]',
    '- 문장을 짧게, 명사형 어미로 끝맺어.',
    '- 예: "내일 체육대회가 있습니다" → "내일 체육대회 예정"',
    '- 예: "우산을 챙겨 오세요" → "우산 지참 필수"',
    '- 예: "준비물을 확인해 주세요" → "준비물 확인 필요"',
    '- 핵심 정보만 간결하게.',
    '- 불필요한 조사나 수식어 최소화.',
    '- 항목별로 줄바꿈하여 한눈에 보기 쉽게.',
    '- 어미 예시: ~필수, ~예정, ~안내, ~필요, ~요망, ~부탁.',
    '',
    '[주의]',
    '- 딱딱하지만 존댓말 기조 유지 (예: ~해주시기 바랍니다 → ~부탁드립니다).',
    '- 중요한 당부는 강조 가능.',
    '- 마무리는 "감사드립니다" 또는 간결한 맺음말.'
  ].join('\n'),
  '목록형':  '번호를 매긴 리스트 형식으로 정리해.',
  '핵심만':  '짧고 간결하게 핵심 키워드 위주로만 써.',
  '친근한':  '친근한 대화체로 작성해.',
  '공식적':  '정중한 공식 문서체로 작성해.',
  '감성적':  '따뜻하고 감성적인 어투로 작성해.',
  '활기찬':  '활기차고 에너지 넘치는 어투로, 느낌표와 이모지를 풍부하게 사용해.',
};

const POSITION_GUIDE = {
  '맨 위':   '인사말로 시작하고 마무리는 간단하게.',
  '맨 아래': '바로 내용으로 시작하고, 마지막에 따뜻한 인사말로 마무리해.',
  '둘 다':   '인사말로 시작하고, 내용 전달 후 따뜻한 맺음말로 끝내.',
};

const LENGTH_GUIDE = {
  '짧게': '전체 길이는 3줄 이내로 짧게.',
  '중간': '전체 길이는 5~7줄 정도로.',
  '길게': '전체 길이는 10줄 이상, 풍부하게 작성해.',
};

function buildEmojiGuide(emojiLevel, greetingIcon) {
  if (emojiLevel === '없이') return '이모지는 전혀 사용하지 마.';
  if (emojiLevel === '많이') return '이모지를 매우 풍부하게, 거의 모든 문장에 사용해.';
  if (greetingIcon && greetingIcon !== '없음') return `인사말에 ${greetingIcon} 이모지를 사용하고, 본문에도 적절히 사용해.`;
  return '';
}

function buildHonorificGuide(honorific) {
  return honorific === '반말'
    ? '학생들에게 직접 말하는 듯한 친근한 반말로 작성해.'
    : '학부모님께 드리는 정중한 존댓말로 작성해.';
}

// ── POST /api/generate ────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const {
    topics, teacherName, className, grade,
    style, greetingLength, greetingPosition, greetingIcon,
    emojiLevel, honorific, signature,
  } = req.body;

  if (!topics || topics.length === 0) {
    return res.status(400).json({ error: '주제를 하나 이상 선택해주세요.' });
  }

  const gradeLabel  = grade || '초등학교';
  const topicLines  = topics.map(t => `- [${t.subject}] ${t.keywords || ''}`).join('\n');
  const userMessage = `담임: ${teacherName || '선생님'} / 학급: ${className || gradeLabel}\n\n오늘 알림장 내용:\n${topicLines}`;
  const maxTokens   = greetingLength === '길게' ? 2048 : 1024;

  const system = [
    `${gradeLabel} 담임 선생님이 학부모님께 보내는 알림장을 작성해줘.`,
    '정확한 맞춤법과 띄어쓰기를 사용해.',
    buildHonorificGuide(honorific),
    STYLE_GUIDE[style]              || STYLE_GUIDE['기본'],
    POSITION_GUIDE[greetingPosition] || POSITION_GUIDE['맨 위'],
    LENGTH_GUIDE[greetingLength]    || LENGTH_GUIDE['중간'],
    buildEmojiGuide(emojiLevel, greetingIcon),
    signature ? `알림장 끝에 다음 서명을 그대로 추가해:\n${signature}` : '',
    '마크다운 없이 순수 텍스트로만 출력해.',
  ].filter(Boolean).join('\n');

  try {
    console.log('[/api/generate] 시작 - grade:', gradeLabel, '| style:', style);
    const msg  = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system, messages: [{ role: 'user', content: userMessage }] });
    const text = msg.content[0].text;
    console.log('[/api/generate] 성공 -', text.length, '자');
    res.json({ text });
  } catch (err) {
    console.error('[/api/generate] 오류:', err.status, err.message);
    res.status(500).json({ error: 'AI 생성 중 오류가 발생했습니다.', detail: err.message });
  }
});

// ── POST /api/generate-free ───────────────────────────────────────────────────
app.post('/api/generate-free', async (req, res) => {
  const {
    freeText, teacherName, className, grade,
    style, greetingLength, greetingPosition, greetingIcon,
    emojiLevel, honorific, signature, weatherContext,
  } = req.body;

  if (!freeText || !freeText.trim()) {
    return res.status(400).json({ error: '내용을 입력해주세요.' });
  }

  const gradeLabel  = grade || '초등학교';
  const userMessage = `담임: ${teacherName || '선생님'} / 학급: ${className || gradeLabel}\n\n다음 내용으로 알림장을 작성해주세요:\n${freeText}`;
  const maxTokens   = greetingLength === '길게' ? 2048 : 1024;

  const system = [
    '당신은 초등학교 담임 선생님의 알림장 작성을 돕는 AI입니다.',
    '',
    '사용자가 제공한 키워드나 단편적인 메모를 기반으로, 맥락을 파악하고 자연스러운 알림장으로 완성해주세요.',
    '',
    '규칙:',
    '- 정확한 맞춤법과 띄어쓰기 사용',
    '- 사용자 입력이 짧아도 구체적으로 풀어 쓰기',
    '- ' + buildHonorificGuide(honorific),
    '- 맥락이 불명확하면 합리적으로 추측하여 보완',
    '- 없는 내용을 임의로 만들지 말고, 입력 내용 범위 안에서 작성',
    STYLE_GUIDE[style]              || STYLE_GUIDE['기본'],
    POSITION_GUIDE[greetingPosition] || POSITION_GUIDE['맨 위'],
    LENGTH_GUIDE[greetingLength]    || LENGTH_GUIDE['중간'],
    buildEmojiGuide(emojiLevel, greetingIcon),
    weatherContext ? `오늘 날씨: ${weatherContext}. 자연스럽게 날씨 관련 내용을 한 줄 언급해줘.` : '',
    signature ? `알림장 끝에 다음 서명을 그대로 추가해:\n${signature}` : '',
    '마크다운 없이 순수 텍스트로만 출력해.',
  ].filter(Boolean).join('\n');

  try {
    console.log('[/api/generate-free] 시작 - grade:', gradeLabel, '| style:', style, '| length:', greetingLength);
    const msg  = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system, messages: [{ role: 'user', content: userMessage }] });
    const text = msg.content[0].text;
    console.log('[/api/generate-free] 성공 -', text.length, '자');
    res.json({ text });
  } catch (err) {
    console.error('[/api/generate-free] 오류:', err.status, err.message);
    res.status(500).json({ error: 'AI 생성 중 오류가 발생했습니다.', detail: err.message });
  }
});

// ── POST /api/regenerate ──────────────────────────────────────────────────────
app.post('/api/regenerate', async (req, res) => {
  const { originalText, instruction, style, greetingLength, honorific } = req.body;
  if (!originalText) return res.status(400).json({ error: '원본 텍스트가 없습니다.' });

  const system = [
    '다음 알림장을 개선해줘.',
    '정확한 맞춤법과 띄어쓰기를 사용해.',
    buildHonorificGuide(honorific),
    STYLE_GUIDE[style] || STYLE_GUIDE['기본'],
    instruction || '더 자연스럽고 완성도 있게 다듬어줘.',
    '마크다운 없이 순수 텍스트로만 출력해.',
  ].join('\n');

  try {
    console.log('[/api/regenerate] 시작 - instruction:', instruction);
    const msg  = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: greetingLength === '길게' ? 2048 : 1024, system, messages: [{ role: 'user', content: `원본 알림장:\n${originalText}` }] });
    const text = msg.content[0].text;
    console.log('[/api/regenerate] 성공 -', text.length, '자');
    res.json({ text });
  } catch (err) {
    console.error('[/api/regenerate] 오류:', err.status, err.message);
    res.status(500).json({ error: 'AI 재생성 중 오류가 발생했습니다.', detail: err.message });
  }
});

// ── POST /api/resize ──────────────────────────────────────────────────────────
app.post('/api/resize', async (req, res) => {
  const { text, direction } = req.body;
  if (!text)      return res.status(400).json({ error: '텍스트가 없습니다.' });
  if (!direction) return res.status(400).json({ error: 'direction 이 없습니다.' });

  const instruction = direction === 'shorter'
    ? '이 알림장을 핵심만 남기고 절반 이하로 줄여줘. 형식과 어투는 그대로 유지해.'
    : '이 알림장을 2배 정도 더 자세하고 풍부하게 늘려줘. 기존 내용 범위 안에서만 확장해.';

  try {
    console.log('[/api/resize] 시작 - direction:', direction);
    const msg    = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, system: instruction + '\n마크다운 없이 순수 텍스트로만 출력해.', messages: [{ role: 'user', content: text }] });
    const resized = msg.content[0].text;
    console.log('[/api/resize] 성공 -', resized.length, '자');
    res.json({ text: resized });
  } catch (err) {
    console.error('[/api/resize] 오류:', err.status, err.message);
    res.status(500).json({ error: '길이 조정 중 오류가 발생했습니다.', detail: err.message });
  }
});

// ── GET /api/weather ──────────────────────────────────────────────────────────
app.get('/api/weather', async (req, res) => {
  try {
    const [wResult, aResult] = await Promise.allSettled([
      httpsGet('https://api.open-meteo.com/v1/forecast?latitude=37.4508&longitude=126.6771&current=temperature_2m,precipitation,weathercode&timezone=Asia%2FSeoul'),
      httpsGet('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=37.4508&longitude=126.6771&current=pm10,pm2_5&timezone=Asia%2FSeoul'),
    ]);

    const w = wResult.status === 'fulfilled' ? wResult.value : {};
    const a = aResult.status === 'fulfilled' ? aResult.value : {};

    if (wResult.status === 'rejected') console.warn('[/api/weather] 날씨 API 실패:', wResult.reason?.message);
    if (aResult.status === 'rejected') console.warn('[/api/weather] 공기질 API 실패:', aResult.reason?.message);

    const temp   = w.current?.temperature_2m ?? null;
    const precip = w.current?.precipitation  ?? 0;
    const wcode  = w.current?.weathercode    ?? 0;
    const pm10   = a.current?.pm10           ?? null;

    const suggestions = [];
    if (precip > 0 || (wcode >= 51 && wcode <= 82)) suggestions.push('우산 챙기기');
    if (pm10 !== null && pm10 > 80)                  suggestions.push('미세먼지 마스크');
    if (temp !== null && temp < 5)                   suggestions.push('따뜻하게 입기');
    if (temp !== null && temp > 32)                  suggestions.push('더위 조심');

    const weatherLabel = temp === null ? null :
      wcode === 0  ? '☀️ 맑음' :
      precip > 0   ? '🌧 비'   :
      wcode <= 3   ? '⛅ 구름' : '☁️ 흐림';

    res.json({ temp, pm10: pm10 ? Math.round(pm10) : null, weatherLabel, suggestions });
  } catch (err) {
    console.error('[/api/weather] 오류:', err.message);
    res.json({ suggestions: [] });
  }
});

// ── POST /api/alrim ───────────────────────────────────────────────────────────
app.post('/api/alrim', async (req, res) => {
  const { teacher_name, class_name, topics, generated_text, edited_text, settings, signature } = req.body;

  if (!generated_text) {
    return res.status(400).json({ error: '저장할 알림장 내용이 없습니다.' });
  }

  const { data, error } = await supabase
    .from('alrim_entries')
    .insert([{ teacher_name, class_name, topics, generated_text, edited_text, settings, signature }])
    .select()
    .single();

  if (error) {
    console.error('[/api/alrim POST] Supabase 오류:', error.code, error.message);
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.', detail: error.message });
  }
  res.json({ success: true, data });
});

// ── GET /api/alrim ────────────────────────────────────────────────────────────
app.get('/api/alrim', async (req, res) => {
  const { all, limit = '20', offset = '0', search, from, to, teacher } = req.query;
  const lim = Math.min(parseInt(limit) || 20, 100);
  const off = parseInt(offset) || 0;

  let query = supabase
    .from('alrim_entries')
    .select('id, teacher_name, class_name, date, topics, generated_text, edited_text, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);

  if (!all) {
    // 기본: 오늘 날짜만 (기존 동작 유지)
    query = query.eq('date', new Date().toISOString().split('T')[0]);
  } else {
    if (from) query = query.gte('date', from);
    if (to)   query = query.lte('date', to);
  }
  if (search)  query = query.ilike('generated_text', `%${search}%`);
  if (teacher) query = query.ilike('teacher_name',   `%${teacher}%`);

  const { data, error, count } = await query;
  if (error) {
    console.error('[/api/alrim GET] Supabase 오류:', error.code, error.message);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.', detail: error.message });
  }
  res.json({ data, total: count });
});

// ── DELETE /api/alrim/:id ─────────────────────────────────────────────────────
app.delete('/api/alrim/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: '유효하지 않은 ID입니다.' });

  const { error } = await supabase.from('alrim_entries').delete().eq('id', id);
  if (error) {
    console.error('[/api/alrim DELETE] Supabase 오류:', error.code, error.message);
    return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.', detail: error.message });
  }
  console.log('[/api/alrim DELETE] 삭제 완료 - id:', id);
  res.json({ success: true });
});

// ── POST /api/usage ───────────────────────────────────────────────────────────
app.post('/api/usage', async (req, res) => {
  const { keywords } = req.body;
  if (!Array.isArray(keywords) || keywords.length === 0) return res.json({ ok: true });
  const rows = keywords
    .filter(k => typeof k === 'string' && k.trim().length >= 2 && k.trim().length <= 50)
    .map(k => ({ keyword: k.trim() }));
  if (rows.length > 0) await supabase.from('alrim_keyword_usage').insert(rows);
  res.json({ ok: true });
});

// ── GET /api/trending ─────────────────────────────────────────────────────────
app.get('/api/trending', async (req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('alrim_keyword_usage')
    .select('keyword')
    .gte('used_at', weekAgo)
    .limit(5000);

  if (error || !data) return res.json({ data: [] });

  const counts = {};
  data.forEach(r => { counts[r.keyword] = (counts[r.keyword] || 0) + 1; });
  const trending = Object.entries(counts)
    .filter(([, c]) => c >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([keyword, count]) => ({ keyword, count }));

  res.json({ data: trending });
});

// ── POST /api/translate ───────────────────────────────────────────────────────
app.post('/api/translate', async (req, res) => {
  const { text, targetLang, targetLangName } = req.body;
  if (!text)         return res.status(400).json({ error: '번역할 텍스트가 없습니다.' });
  if (!targetLang)   return res.status(400).json({ error: '대상 언어가 없습니다.' });

  const langLabel = targetLangName || targetLang;
  const system = [
    `당신은 학교 알림장을 번역하는 전문 번역가입니다.`,
    `한국어 알림장을 ${langLabel}로 자연스럽게 번역해주세요.`,
    `다문화 가정 학부모가 이해하기 쉽게, 문화적 맥락도 고려해서 번역합니다.`,
    `번역문만 출력하고 다른 설명·주석은 하지 마세요.`,
    `마크다운 없이 순수 텍스트로만 출력해.`,
  ].join('\n');

  try {
    console.log('[/api/translate] 시작 - lang:', targetLang);
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: `다음 알림장을 ${langLabel}로 번역해주세요:\n\n${text}` }],
    });
    const translated = msg.content[0].text;
    console.log('[/api/translate] 성공 - lang:', targetLang, '길이:', translated.length);
    res.json({ translated });
  } catch (err) {
    console.error('[/api/translate] 오류:', err.status, err.message);
    res.status(500).json({ error: '번역 중 오류가 발생했습니다.', detail: err.message });
  }
});

// ── 404 / 전역 에러 핸들러 ────────────────────────────────────────────────────
app.use((req, res) => {
  console.warn('[404]', req.method, req.url);
  res.status(404).json({ error: `${req.method} ${req.url} 는 존재하지 않는 엔드포인트입니다.` });
});
app.use((err, req, res, _next) => {
  console.error('[Express 에러]', req.method, req.url, err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`석암 알림봇 서버 실행 중: http://localhost:${PORT}`);
  console.log('  ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✅ 설정됨' : '❌ 없음');
  console.log('  SUPABASE_URL:     ', process.env.SUPABASE_URL      ? '✅ 설정됨' : '❌ 없음');
  console.log('  SUPABASE_KEY:     ', process.env.SUPABASE_KEY      ? '✅ 설정됨' : '❌ 없음');
});
