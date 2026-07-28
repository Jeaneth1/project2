# Study Companion

I built Study Companion as my Project 2 for CS355: Internet and Web Technologies. It is a full stack GenAI web application that helps me study for exams, including CompTIA Security Plus and other cybersecurity coursework, by combining an AI tutor with a personalized, adaptive study schedule.

## Why I Built This

I am a Computer Science student preparing for both my SOC analyst job search and my CompTIA certification, and I wanted a tool that did more than answer a question once and forget it. I wanted something that remembered what I studied, tracked what I actually got wrong, and helped me plan around that. This project let me build exactly that, while also giving me real practice with authentication, database design, and API integration, all skills I am building toward a cybersecurity and software engineering career.

## What It Does

A user signs up, signs in, and lands on the main page, where they type in any topic they want to study. Gemini generates an explanation, a set of multiple choice practice questions, and a list of resources. The quiz is graded automatically. If I get something wrong, I can retry it and Gemini generates new questions covering the same concept, not the same questions repeated. Every session is saved to my history, organized by day, so I can look back and see everything I have studied.

The calendar is the part I am most proud of. It builds a full week, hour by hour, based on my own wake and sleep times, and it automatically prioritizes topics I marked as needing more practice. I can move a topic to a different day or hour if my schedule changes, or remove a topic entirely if I no longer need to study it. I also added an email reminder system that sends me a message fifteen minutes before a scheduled study session, so I do not have to remember to check the app myself.

## Tech Stack

- Backend: Node.js and Express
- Database: SQLite, using better-sqlite3
- Frontend: EJS templates with my own CSS
- AI: Google Gemini API
- Authentication: bcrypt for password hashing, express-session for login sessions
- Email: Resend API, with node-cron running the scheduled reminder checks
- Markdown rendering: marked, to turn Gemini's formatted responses into real HTML

## Database Schema

**users**: id, username, email, password (hashed), wake_time, sleep_time

**study_sessions**: id, user_id, topic, gemini_response, questions_json, correctness_json, questions_correct, questions_total, rating, created_at

**chat_messages**: id, session_id, user_id, role, content, created_at

**day_schedule**: id, user_id, day_index, wake_time, sleep_time

**excluded_topics**: id, user_id, day_index, topic

**manual_placements**: id, user_id, topic, day_index, hour

**sent_reminders**: id, user_id, topic, sent_date

## API Used

Google Gemini API, model gemini-flash-latest, for generating explanations, quiz questions, resources, and follow up chat responses.

## Running the Server Locally

1. Install dependencies:
```bash
npm install
```

2. Create a .env file with:
GEMINI_API_KEY=your_gemini_api_key
SESSION_SECRET=any_random_string
RESEND_API_KEY=your_resend_api_key

3. Start the server:
```bash
node bin/www
```

4. Visit localhost in your browser at the configured port.

The SQLite database is created automatically the first time the server runs.

## Known Limitations

I used Resend's free tier for email reminders, which only allows sending to my own verified email address until a custom domain is verified, which requires purchasing a domain. Because of this, reminder emails during testing will be delivered to my own inbox rather than the grader's, but the scheduling and matching logic itself is fully functional.

Render's free web service tier uses an ephemeral filesystem, meaning the SQLite database resets on redeploys, restarts, or after 15 minutes of inactivity (free-tier spin-down). To ensure grading access always works, the app automatically seeds a guaranteed test account (professor_test / TestPass123) on every startup, regardless of prior data state.

Will provided my username and email so you can test the email alerts and how the system works via the comment in brightspace

## Notes

I hashed every password with bcrypt before storing it, and I used parameterized SQL queries throughout to prevent SQL injection. Every protected route checks the session individually through a custom requireAuth middleware, so signup and signin stay accessible without a login while everything else stays locked down.