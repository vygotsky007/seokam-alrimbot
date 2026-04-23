require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = message.content[0].text;
    res.json({ text });
  } catch (err) {
    console.error('Claude API error:', err);
    res.status(500).json({ error: 'AI 생성 중 오류가 발생했습니다.' });
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
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
    res.json({ text: message.content[0].text });
  } catch (err) {
    console.error('Claude API error (free):', err);
    res.status(500).json({ error: 'AI 생성 중 오류가 발생했습니다.' });
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
    console.error('Supabase insert error:', error);
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
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
    console.error('Supabase select error:', error);
    return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }

  res.json({ data });
});

app.listen(PORT, () => {
  console.log(`석암 알림봇 서버 실행 중: http://localhost:${PORT}`);
});
