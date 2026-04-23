require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

// 시작 시 필수 환경변수 검증
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

// 처리되지 않은 예외가 서버를 조용히 죽이지 않도록 로깅
process.on('uncaughtException', err => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// POST /api/generate — Claude API로 알림장 생성
app.post('/api/generate', async (req, res) => {
  const { topics, teacherName, className, grade, style, greetingLength, greetingPosition, greetingIcon } = req.body;

  if (!topics || topics.length === 0) {
    return res.status(400).json({ error: '주제를 하나 이상 선택해주세요.' });
  }

  const topicLines = topics
    .map(t => `- [${t.subject}] ${t.keywords || ''}`)
    .join('\n');

  const gradeLabel = grade || '초등학교';
  const userMessage = `담임: ${teacherName || '선생님'} / 학급: ${className || gradeLabel}\n\n오늘 알림장 내용:\n${topicLines}`;

  const styleGuide = {
    '기본':   '자연스러운 문장형으로 작성해.',
    '목록형': '번호를 매긴 리스트 형식으로 정리해.',
    '핵심만': '짧고 간결하게 핵심 키워드 위주로만 써.',
    '친근한': '친근한 대화체로, 이모지를 풍부하게 사용해.',
    '공식적': '정중한 공식 문서체로 작성해.',
    '감성적': '따뜻하고 감성적인 어투로 작성해.',
  };
  const positionGuide = {
    '맨 위':  '인사말로 시작하고 마무리는 간단하게.',
    '맨 아래': '바로 내용으로 시작하고, 마지막에 따뜻한 인사말로 마무리해.',
    '둘 다':  '인사말로 시작하고, 내용 전달 후 따뜻한 맺음말로 끝내.',
  };
  const lengthGuide = {
    '짧게': '전체 길이는 3줄 이내로 짧게.',
    '중간': '전체 길이는 5~7줄 정도로.',
    '길게': '전체 길이는 10줄 이상, 풍부하게 작성해.',
  };
  const emojiGuide = greetingIcon === '없음'
    ? '이모지는 전혀 사용하지 마.'
    : `인사말에 ${greetingIcon} 이모지를 사용하고, 본문에도 적절히 사용해.`;

  const system = [
    `${gradeLabel} 담임 선생님이 학부모님께 보내는 알림장을 작성해줘.`,
    styleGuide[style]           || styleGuide['기본'],
    positionGuide[greetingPosition] || positionGuide['맨 위'],
    lengthGuide[greetingLength] || lengthGuide['중간'],
    emojiGuide,
    '마크다운 없이 순수 텍스트로만 출력해.',
  ].join('\n');

  const maxTokens = greetingLength === '길게' ? 2048 : 1024;

  try {
    console.log('[/api/generate] 요청 시작 - grade:', gradeLabel, '| style:', style, '| length:', greetingLength);
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = message.content[0].text;
    console.log('[/api/generate] 성공 - 길이:', text.length, '자');
    res.json({ text });
  } catch (err) {
    console.error('[/api/generate] Claude API 오류:', err.status, err.message, err.error);
    res.status(500).json({ error: 'AI 생성 중 오류가 발생했습니다.', detail: err.message });
  }
});

// POST /api/generate-free — 자유 텍스트 기반 알림장 생성
app.post('/api/generate-free', async (req, res) => {
  const { freeText, teacherName, className, grade, style, greetingLength, greetingPosition, greetingIcon } = req.body;

  if (!freeText || !freeText.trim()) {
    return res.status(400).json({ error: '내용을 입력해주세요.' });
  }

  const gradeLabel = grade || '초등학교';
  const userMessage = `담임: ${teacherName || '선생님'} / 학급: ${className || gradeLabel}\n\n다음 내용으로 알림장을 작성해주세요:\n${freeText}`;

  const styleGuide = {
    '기본':   '자연스러운 문장형으로 작성해.',
    '목록형': '번호를 매긴 리스트 형식으로 정리해.',
    '핵심만': '짧고 간결하게 핵심 키워드 위주로만 써.',
    '친근한': '친근한 대화체로, 이모지를 풍부하게 사용해.',
    '공식적': '정중한 공식 문서체로 작성해.',
    '감성적': '따뜻하고 감성적인 어투로 작성해.',
  };
  const positionGuide = {
    '맨 위':  '인사말로 시작하고 마무리는 간단하게.',
    '맨 아래': '바로 내용으로 시작하고, 마지막에 따뜻한 인사말로 마무리해.',
    '둘 다':  '인사말로 시작하고, 내용 전달 후 따뜻한 맺음말로 끝내.',
  };
  const lengthGuide = {
    '짧게': '전체 길이는 3줄 이내로 짧게.',
    '중간': '전체 길이는 5~7줄 정도로.',
    '길게': '전체 길이는 10줄 이상, 풍부하게 작성해.',
  };
  const emojiGuide = greetingIcon === '없음'
    ? '이모지는 전혀 사용하지 마.'
    : `인사말에 ${greetingIcon} 이모지를 사용하고, 본문에도 적절히 사용해.`;

  const system = [
    `당신은 초등학교 담임 선생님의 알림장 작성을 돕는 AI입니다.`,
    `학부모님께 보내는 알림장을 작성해주세요.`,
    ``,
    `사용자가 제공한 키워드나 단편적인 메모를 기반으로, 맥락을 파악하고 자연스러운 알림장으로 완성해주세요.`,
    ``,
    `규칙:`,
    `- 사용자 입력이 짧아도 구체적으로 풀어 쓰기`,
    `- 학부모에게 정중하게 전달`,
    `- 맥락이 불명확하면 합리적으로 추측하여 보완`,
    `- 없는 내용을 임의로 만들지 말고, 입력 내용 범위 안에서 작성`,
    styleGuide[style] || styleGuide['기본'],
    positionGuide[greetingPosition] || positionGuide['맨 위'],
    lengthGuide[greetingLength] || lengthGuide['중간'],
    emojiGuide,
    '마크다운 없이 순수 텍스트로만 출력해.',
  ].join('\n');

  const maxTokens = greetingLength === '길게' ? 2048 : 1024;

  try {
    console.log('[/api/generate-free] 요청 시작 - grade:', gradeLabel, '| style:', style, '| length:', greetingLength);
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
    const text = message.content[0].text;
    console.log('[/api/generate-free] 성공 - 길이:', text.length, '자');
    res.json({ text });
  } catch (err) {
    console.error('[/api/generate-free] Claude API 오류:', err.status, err.message, err.error);
    res.status(500).json({ error: 'AI 생성 중 오류가 발생했습니다.', detail: err.message });
  }
});

// POST /api/alrim — 알림장 저장
app.post('/api/alrim', async (req, res) => {
  const { teacher_name, class_name, topics, generated_text, edited_text } = req.body;

  if (!generated_text) {
    return res.status(400).json({ error: '저장할 알림장 내용이 없습니다.' });
  }

  const { data, error } = await supabase
    .from('alrim_entries')
    .insert([{ teacher_name, class_name, topics, generated_text, edited_text }])
    .select()
    .single();

  if (error) {
    console.error('[/api/alrim POST] Supabase 오류:', error.code, error.message);
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.', detail: error.message });
  }

  res.json({ success: true, data });
});

// GET /api/alrim — 오늘 저장된 알림장 목록
app.get('/api/alrim', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('alrim_entries')
    .select('id, teacher_name, class_name, date, topics, generated_text, edited_text, created_at')
    .eq('date', today)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[/api/alrim GET] Supabase 오류:', error.code, error.message);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.', detail: error.message });
  }

  res.json({ data });
});

// POST /api/usage — 키워드 사용 기록 (fire-and-forget)
app.post('/api/usage', async (req, res) => {
  const { keywords } = req.body;
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return res.json({ ok: true });
  }
  const rows = keywords
    .filter(k => typeof k === 'string' && k.trim().length >= 2 && k.trim().length <= 50)
    .map(k => ({ keyword: k.trim() }));
  if (rows.length > 0) {
    await supabase.from('alrim_keyword_usage').insert(rows);
  }
  res.json({ ok: true });
});

// GET /api/trending — 최근 7일 TOP 10 트렌딩 키워드
app.get('/api/trending', async (req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('alrim_keyword_usage')
    .select('keyword')
    .gte('used_at', weekAgo)
    .limit(5000);

  if (error || !data) {
    return res.json({ data: [] });
  }

  const counts = {};
  data.forEach(r => { counts[r.keyword] = (counts[r.keyword] || 0) + 1; });
  const trending = Object.entries(counts)
    .filter(([, c]) => c >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([keyword, count]) => ({ keyword, count }));

  res.json({ data: trending });
});

// 처리되지 않은 라우트 → JSON 404 (HTML 폴백 방지)
app.use((req, res) => {
  console.warn('[404]', req.method, req.url);
  res.status(404).json({ error: `${req.method} ${req.url} 는 존재하지 않는 엔드포인트입니다.` });
});

// Express 전역 에러 핸들러 → 항상 JSON 반환
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
