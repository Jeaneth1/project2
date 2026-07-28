const cron = require('node-cron');
const nodemailer = require('nodemailer');
const db = require('./db');

const REMINDER_LEAD_MINUTES = 15;

function getReminderTime(scheduledHour) {
  let totalMinutes = scheduledHour * 60 - REMINDER_LEAD_MINUTES;
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  return { hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 };
}

function getTodaysScheduledTopic(userId) {
  const now = new Date();
  const todayIndex = now.getDay();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const daySetting = db.prepare('SELECT * FROM day_schedule WHERE user_id = ? AND day_index = ?').get(userId, todayIndex);
  const wakeHour = parseInt((daySetting ? daySetting.wake_time : '08:00').split(':')[0]);
  const sleepHour = parseInt((daySetting ? daySetting.sleep_time : '22:00').split(':')[0]);
  const studyHour = wakeHour + 1 < sleepHour ? wakeHour + 1 : wakeHour;

  const manualRows = db.prepare('SELECT topic, hour FROM manual_placements WHERE user_id = ? AND day_index = ?').all(userId, todayIndex);
  for (const row of manualRows) {
    const reminderTime = getReminderTime(row.hour);
    if (reminderTime.hour === currentHour && reminderTime.minute === currentMinute) {
      return row.topic;
    }
  }

  const autoReminderTime = getReminderTime(studyHour);
  if (autoReminderTime.hour !== currentHour || autoReminderTime.minute !== currentMinute) {
    return null;
  }

  const excludedRows = db.prepare('SELECT topic FROM excluded_topics WHERE user_id = ? AND day_index = ?').all(userId, todayIndex).map(r => r.topic);

  const sessions = db.prepare(`
    SELECT * FROM study_sessions
    WHERE user_id = ?
    ORDER BY
      CASE rating
        WHEN 'needs_practice' THEN 1
        WHEN 'got_it' THEN 3
        ELSE 2
      END
  `).all(userId);

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
  const dayPool = fullPool.filter(t => !excludedRows.includes(t));

  if (dayPool.length === 0) return null;
  return dayPool[todayIndex % dayPool.length];
}

function checkAndSendReminders() {
  const users = db.prepare('SELECT * FROM users').all();
  const todayStr = new Date().toISOString().slice(0, 10);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  users.forEach(user => {
    const topic = getTodaysScheduledTopic(user.id);
    if (!topic) return;

    const alreadySent = db.prepare('SELECT 1 FROM sent_reminders WHERE user_id = ? AND topic = ? AND sent_date = ?').get(user.id, topic, todayStr);
    if (alreadySent) return;

    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Study Companion: ' + topic + ' coming up in 15 minutes',
      text: `Heads up - you're scheduled to study "${topic}" in 15 minutes. Log in to Study Companion to get ready.`
    }).then(() => {
      db.prepare('INSERT OR IGNORE INTO sent_reminders (user_id, topic, sent_date) VALUES (?, ?, ?)').run(user.id, topic, todayStr);
    }).catch(err => {
      console.log('Reminder email failed for user', user.id, err.message);
    });
  });
}

function startScheduler() {
  cron.schedule('*/5 * * * *', checkAndSendReminders);
}

module.exports = startScheduler;