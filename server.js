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
  const { topics, teacherName, className, greetingLength, greetingIcon } = req.body;

  if (!topics || topics.length === 0) {
    return res.status(400).json({ error: '주제를 하나 이상 선택해주세요.' });
  }

  const topicLines = topics
    .map(t => `- [${t.subject}] ${t.keywords || ''}`)
    .join('\n');

  const userMessage = `담임: ${teacherName || '선생님'} / 학급: ${className || ''}\n\n오늘 알림장 내용:\n${topicLines}`;

  const lengthGuide = {
    '짧게': '인사말은 "안녕하세요" 한 줄만 간결하게 써.',
    '중간': '인사말은 한두 문장으로 짧게 써.',
    '길게': '인사말은 두세 문장으로 따뜻하게 작성해.',
  };
  const emojiGuide = greetingIcon === '없음'
    ? '이모지는 전혀 사용하지 마.'
    : `인사말 시작에 ${greetingIcon} 이모지를 넣고, 본문에도 이모지를 자연스럽게 사용해.`;

  const system =
    '초등학교 담임 선생님이 학부모님께 보내는 알림장을 작성해줘.\n' +
    '정중하면서도 친근하게.\n' +
    '인사 + 내용 + 맺음말 구조로 작성.\n' +
    (lengthGuide[greetingLength] || lengthGuide['중간']) + '\n' +
    emojiGuide + '\n' +
    '마크다운 없이 순수 텍스트로만 출력해.';

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
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
