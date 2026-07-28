const {marked} = require('marked');
const db = require('../db');
var express = require('express');
var router = express.Router();
var requireAuth = require('../middleware/requireAuth');

/* GET home page. */
router.get('/', requireAuth, function(req, res) {
  const lastSession = db.prepare('SELECT * FROM study_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.session.userId);
  res.render('index', { studyResult: null, quiz: null, sessionId: null, prefillTopic: req.query.topic || '', lastSession: lastSession });
});

router.post('/study', requireAuth, async(req,res)=>{
const {user_topic, question_count, resource_count} = req.body;
const numQuestions = question_count || 5;
const numResources = resource_count || 3;

const prompt = `You are a study assistant. Respond ONLY with a valid JSON object, no markdown code fences, no extra commentary, in exactly this structure:
{
  "explanation": "a clear explanation of the topic, may include markdown formatting",
  "resources": ["resource 1", "resource 2"],
  "questions": [
    { "question": "question text", "options": ["option A", "option B", "option C", "option D"], "correct_index": 0 }
  ]
}
Topic: "${user_topic}". Provide exactly ${numQuestions} multiple-choice questions and ${numResources} resources.`;

try{
const response = await fetch( `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
method: 'POST',
headers: {'Content-Type': 'application/json'},
body: JSON.stringify({
contents: [{parts:[{text:prompt}]}]
        })
      }
    );
const data = await response.json();
let rawText = data.candidates[0].content.parts[0].text;

rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

const parsed = JSON.parse(rawText);

const questionsWithIndex = parsed.questions.map((q, i) => Object.assign({}, q, { qindex: i }));

let explanationHtml = marked.parse(parsed.explanation);
if (parsed.resources && parsed.resources.length) {
  const resourceList = parsed.resources.map(r => `- ${r}`).join('\n');
  explanationHtml += marked.parse('\n\n### Resources\n' + resourceList);
}

const insertSession = db.prepare('INSERT INTO study_sessions (user_id, topic, gemini_response, questions_json, questions_total) VALUES (?,?,?,?,?)');
const result = insertSession.run(req.session.userId, user_topic, explanationHtml, JSON.stringify(questionsWithIndex), questionsWithIndex.length);

res.render('index', {
  studyResult: explanationHtml,
  quiz: questionsWithIndex,
  sessionId: result.lastInsertRowid,
  prefillTopic: user_topic,
  lastSession: null
});
  } catch (err){
res.status(500).send('Gemini request failed: ' + err.message);
  }
});

router.post('/study/:id/grade', requireAuth, (req, res) => {
  const session = db.prepare('SELECT * FROM study_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!session) {
    return res.status(404).send('Session not found');
  }

  const questions = JSON.parse(session.questions_json);
  let correctness = session.correctness_json ? JSON.parse(session.correctness_json) : new Array(questions.length).fill(null);

  questions.forEach((q) => {
    const submittedAnswer = req.body['answer_' + q.qindex];
    if (submittedAnswer !== undefined) {
      correctness[q.qindex] = (parseInt(submittedAnswer) === q.correct_index);
    }
  });

  const correctCount = correctness.filter(v => v === true).length;
  const rating = (correctCount === questions.length) ? 'got_it' : 'needs_practice';

  const updateResult = db.prepare('UPDATE study_sessions SET questions_correct = ?, rating = ?, correctness_json = ? WHERE id = ? AND user_id = ?');
  updateResult.run(correctCount, rating, JSON.stringify(correctness), req.params.id, req.session.userId);

  res.render('index', {
    studyResult: session.gemini_response,
    quiz: null,
    sessionId: null,
    prefillTopic: session.topic,
    lastSession: null,
    gradeResult: { correct: correctCount, total: questions.length, topic: session.topic, sessionId: session.id }
  });
});

router.get('/study/:id/continue', requireAuth, async (req, res) => {
  const session = db.prepare('SELECT * FROM study_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!session) {
    return res.status(404).send('Session not found');
  }

  const questions = JSON.parse(session.questions_json);
  const correctness = session.correctness_json ? JSON.parse(session.correctness_json) : new Array(questions.length).fill(null);
  const wrongQuestions = questions.filter(q => correctness[q.qindex] !== true);

  if (wrongQuestions.length === 0) {
    return res.render('index', {
      studyResult: session.gemini_response,
      quiz: null,
      sessionId: null,
      prefillTopic: session.topic,
      lastSession: null,
      allCorrect: true
    });
  }

  const missedList = wrongQuestions.map(q => `- ${q.question}`).join('\n');
  const prompt = `A student is studying "${session.topic}" and struggled with these specific questions:
${missedList}

Generate ${wrongQuestions.length} NEW multiple-choice questions that test the same underlying concepts as the ones above, phrased differently (do not repeat the exact same questions). Respond ONLY with a valid JSON object, no markdown code fences, no extra commentary, in exactly this structure:
{
  "questions": [
    { "question": "question text", "options": ["option A", "option B", "option C", "option D"], "correct_index": 0 }
  ]
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(rawText);

    const questionsWithIndex = parsed.questions.map((q, i) => Object.assign({}, q, { qindex: i }));

    const insertSession = db.prepare('INSERT INTO study_sessions (user_id, topic, gemini_response, questions_json, questions_total) VALUES (?,?,?,?,?)');
    const result = insertSession.run(req.session.userId, session.topic, session.gemini_response, JSON.stringify(questionsWithIndex), questionsWithIndex.length);

    res.render('index', {
      studyResult: session.gemini_response,
      quiz: questionsWithIndex,
      sessionId: result.lastInsertRowid,
      prefillTopic: session.topic,
      lastSession: null
    });
  } catch (err) {
    res.status(500).send('Gemini request failed: ' + err.message);
  }
});

router.post('/history/:id/delete', requireAuth, (req, res) => {
const deleteSession = db.prepare('DELETE FROM study_sessions WHERE id = ? AND user_id = ?');
deleteSession.run(req.params.id, req.session.userId);
res.redirect('/history');
});

router.post('/history/:id/rate', requireAuth, (req, res) => {
const updateRating = db.prepare('UPDATE study_sessions SET rating = ? WHERE id = ? AND user_id = ?');
updateRating.run(req.body.rating, req.params.id, req.session.userId);
res.redirect('/history');
});

router.get('/history', requireAuth, (req, res) => {
const sessions = db.prepare('SELECT * FROM study_sessions WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId);
sessions.forEach(session => {
session.gemini_response_html = session.gemini_response;
  });

const groups = {};
sessions.forEach(session => {
const dateLabel = new Date(session.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
if (!groups[dateLabel]) groups[dateLabel] = {};
if (!groups[dateLabel][session.topic]) {
  groups[dateLabel][session.topic] = session;
}
  });

const dedupedGroups = {};
Object.keys(groups).forEach(dateLabel => {
  dedupedGroups[dateLabel] = Object.values(groups[dateLabel]);
});

res.render('history', { groups: dedupedGroups });
});

router.get('/calendar', requireAuth, (req, res) => {
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const daySchedules = db.prepare('SELECT * FROM day_schedule WHERE user_id = ?').all(req.session.userId);
  const scheduleByDay = {};
  daySchedules.forEach(d => { scheduleByDay[d.day_index] = d; });

  const excludedRows = db.prepare('SELECT day_index, topic FROM excluded_topics WHERE user_id = ?').all(req.session.userId);
  const excludedByDay = {};
  excludedRows.forEach(r => {
    if (!excludedByDay[r.day_index]) excludedByDay[r.day_index] = [];
    excludedByDay[r.day_index].push(r.topic);
  });

  const manualRows = db.prepare('SELECT * FROM manual_placements WHERE user_id = ?').all(req.session.userId);
  const manualByDay = {};
  const manuallyPlacedTopics = [];
  manualRows.forEach(r => {
    if (!manualByDay[r.day_index]) manualByDay[r.day_index] = {};
    manualByDay[r.day_index][r.hour] = r.topic;
    manuallyPlacedTopics.push(r.topic);
  });

  const sessions = db.prepare(`
    SELECT * FROM study_sessions
    WHERE user_id = ?
    ORDER BY
      CASE rating
        WHEN 'needs_practice' THEN 1
        WHEN 'got_it' THEN 3
        ELSE 2
      END
  `).all(req.session.userId);

  const uniqueTopics = {};
  sessions.forEach(s => {
    if (!uniqueTopics[s.topic] || s.rating === 'needs_practice') {
      uniqueTopics[s.topic] = s.rating;
    }
  });

  const needsPractice = Object.keys(uniqueTopics).filter(t => uniqueTopics[t] === 'needs_practice');
  const notRated = Object.keys(uniqueTopics).filter(t => !uniqueTopics[t]);
  const gotIt = Object.keys(uniqueTopics).filter(t => uniqueTopics[t] === 'got_it');

  const fullPool = [...needsPractice, ...needsPractice, ...notRated, ...gotIt];

  const calendarDays = dayNames.map((name, dayIndex) => {
    const daySetting = scheduleByDay[dayIndex];
    const wakeHour = parseInt((daySetting ? daySetting.wake_time : '08:00').split(':')[0]);
    const sleepHour = parseInt((daySetting ? daySetting.sleep_time : '22:00').split(':')[0]);
    const studyHour = wakeHour + 1 < sleepHour ? wakeHour + 1 : wakeHour;

    const dayExcluded = excludedByDay[dayIndex] || [];
    const dayPool = fullPool.filter(t => !dayExcluded.includes(t));
    const dayManual = manualByDay[dayIndex] || {};

    const slots = [];
    const autoTopic = dayPool.length > 0 ? dayPool[dayIndex % dayPool.length] : null;
    for (let hour = wakeHour; hour < sleepHour; hour++) {
      const label = (hour % 12 === 0 ? 12 : hour % 12) + (hour < 12 ? 'am' : 'pm');
      if (dayManual[hour]) {
        slots.push({ time: label, hour: hour, topic: dayManual[hour], status: uniqueTopics[dayManual[hour]], manual: true });
      } else if (hour === studyHour && autoTopic) {
        slots.push({ time: label, hour: hour, topic: autoTopic, status: uniqueTopics[autoTopic], manual: false });
      } else {
        slots.push({ time: label, hour: hour, topic: null, status: null, manual: false });
      }
    }
    return {
      name,
      dayIndex,
      slots,
      wakeTime: daySetting ? daySetting.wake_time : '08:00',
      sleepTime: daySetting ? daySetting.sleep_time : '22:00'
    };
  });

  res.render('calendar', { calendarDays: calendarDays, reminder: req.query.reminder || null });
});

router.post('/remind', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);

  const remindSessions = db.prepare('SELECT DISTINCT topic FROM study_sessions WHERE user_id = ? AND rating = ?').all(req.session.userId, 'needs_practice');

  if (remindSessions.length === 0) {
    return res.redirect('/calendar?reminder=none');
  }

  const topicList = remindSessions.map(s => '- ' + s.topic).join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Study Companion <onboarding@resend.dev>',
        to: user.email,
        subject: 'Study Companion: topics you need to practice',
        text: `Here are the topics you still need to practice:\n\n${topicList}\n\nLog in to Study Companion to keep going.`
      })
    });
    const result = await response.json();
    if (result.id) {
      res.redirect('/calendar?reminder=sent');
    } else {
      res.status(500).send('Email failed: ' + JSON.stringify(result));
    }
  } catch (err) {
    res.status(500).send('Email failed to send: ' + err.message);
  }
});

router.post('/calendar/move', requireAuth, (req, res) => {
  const { topic, day_index, hour } = req.body;
  db.prepare(`
    INSERT INTO manual_placements (user_id, topic, day_index, hour)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, topic) DO UPDATE SET day_index = excluded.day_index, hour = excluded.hour
  `).run(req.session.userId, topic, day_index, hour);
  res.redirect('/calendar');
});

router.post('/calendar/exclude', requireAuth, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO excluded_topics (user_id, day_index, topic) VALUES (?, ?, ?)').run(req.session.userId, req.body.day_index, req.body.topic);
  res.redirect('/calendar');
});

router.get('/calendar/settings', requireAuth, (req, res) => {
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const daySchedules = db.prepare('SELECT * FROM day_schedule WHERE user_id = ?').all(req.session.userId);
  const scheduleByDay = {};
  daySchedules.forEach(d => { scheduleByDay[d.day_index] = d; });

  const days = dayNames.map((name, i) => ({
    index: i,
    name: name,
    wakeTime: scheduleByDay[i] ? scheduleByDay[i].wake_time : '08:00',
    sleepTime: scheduleByDay[i] ? scheduleByDay[i].sleep_time : '22:00'
  }));

  res.render('calendar-settings', { days: days });
});

router.post('/calendar/settings', requireAuth, (req, res) => {
  const upsert = db.prepare(`
    INSERT INTO day_schedule (user_id, day_index, wake_time, sleep_time)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, day_index) DO UPDATE SET wake_time = excluded.wake_time, sleep_time = excluded.sleep_time
  `);
  for (let i = 0; i < 7; i++) {
    const wake = req.body['wake_' + i] || '08:00';
    const sleep = req.body['sleep_' + i] || '22:00';
    upsert.run(req.session.userId, i, wake, sleep);
  }
  res.redirect('/calendar');
});

router.get('/study/:id/chat', requireAuth, (req, res) => {
  const session = db.prepare('SELECT * FROM study_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!session) {
    return res.status(404).send('Session not found');
  }
  const messages = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC').all(req.params.id, req.session.userId);
  messages.forEach(m => {
    m.content_html = m.role === 'assistant' ? marked.parse(m.content) : m.content;
  });
  res.render('chat', { session: session, messages: messages });
});

router.post('/study/:id/chat', requireAuth, async (req, res) => {
  const session = db.prepare('SELECT * FROM study_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!session) {
    return res.status(404).send('Session not found');
  }

  const userMessage = req.body.message;
  db.prepare('INSERT INTO chat_messages (session_id, user_id, role, content) VALUES (?,?,?,?)').run(req.params.id, req.session.userId, 'user', userMessage);

  const priorMessages = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC').all(req.params.id, req.session.userId);

  const contents = [
    { role: 'user', parts: [{ text: `You are a helpful study assistant. The student is studying the topic "${session.topic}". Answer their follow-up questions about this topic clearly and concisely.` }] },
    { role: 'model', parts: [{ text: 'Understood, I will help with that topic.' }] }
  ];
  priorMessages.forEach(m => {
    contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] });
  });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: contents })
      }
    );
    const data = await response.json();
    const replyText = data.candidates[0].content.parts[0].text;

    db.prepare('INSERT INTO chat_messages (session_id, user_id, role, content) VALUES (?,?,?,?)').run(req.params.id, req.session.userId, 'assistant', replyText);

    res.redirect('/study/' + req.params.id + '/chat');
  } catch (err) {
    res.status(500).send('Gemini request failed: ' + err.message);
  }
});

module.exports = router;