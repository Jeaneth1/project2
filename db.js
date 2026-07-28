const Database = require('better-sqlite3');
const db = new Database('app.db');

db.exec(`
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT not NULL,
            wake_time TEXT DEFAULT '08:00',
            sleep_time TEXT DEFAULT '22:00'
        )
    `);

db.exec(`
  CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    gemini_response TEXT NOT NULL,
    questions_json TEXT,
    correctness_json TEXT,
    questions_correct INTEGER,
    questions_total INTEGER,
    rating TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS excluded_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    day_index INTEGER NOT NULL,
    topic TEXT NOT NULL,
    UNIQUE(user_id, day_index, topic)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS day_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    day_index INTEGER NOT NULL,
    wake_time TEXT DEFAULT '08:00',
    sleep_time TEXT DEFAULT '22:00',
    UNIQUE(user_id, day_index)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS manual_placements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    day_index INTEGER NOT NULL,
    hour INTEGER NOT NULL,
    UNIQUE(user_id, topic)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS sent_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    sent_date TEXT NOT NULL,
    UNIQUE(user_id, topic, sent_date)
  )
`);
const bcrypt = require('bcryptjs');
const testUserExists = db.prepare('SELECT id FROM users WHERE username = ?').get('professor_test');
if (!testUserExists) {
  const hashedPassword = bcrypt.hashSync('TestPass123', 10);
  db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run('professor_test', 'professortest@example.com', hashedPassword);
}

module.exports=db;