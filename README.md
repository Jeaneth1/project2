# Study Companion

I built Study Companion as my Project 2 for CS355: Internet and Web Technologies. It is a full stack GenAI web application that helps me study for exams, including CompTIA Security Plus and other cybersecurity coursework, by combining an AI tutor with a personalized, adaptive study schedule.

## Why I Built This

I am a Computer Science student preparing for both my SOC analyst job search and my CompTIA certification, and I wanted a tool that did more than answer a question once and forget it. I wanted something that remembered what I studied, tracked what I actually got wrong, and helped me plan around that. This project let me build exactly that, while also giving me real practice with authentication, database design, and API integration, all skills I am building toward a cybersecurity and software engineering career.

## What It Does

A user signs up, signs in, and lands on the main page, where they type in any topic they want to study. Gemini generates an explanation, a set of multiple choice practice questions, and a list of resources. The quiz is graded automatically. If I get something wrong, I can retry it and Gemini generates new questions covering the same concept, not the same questions repeated. Every session is saved to my history, organized by day, so I can look back and see everything I have studied.

The calendar is the part I am most proud of. It builds a full week, hour by hour, based on my own wake and sleep times, and it automatically prioritizes topics I marked as needing more practice. I can move a topic to a different day or hour if my schedule changes, or remove a topic entirely if I no longer need to study it. I also added an email reminder system that sends me a message fifteen minutes before a scheduled study session, so I do not have to remember to check the app myself. I also have a delete account in calendar scheduling so it ensure you don't delete your account by accident. 

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

## Security Revamp

This section documents a security audit I performed on my own completed 
project, working through real vulnerabilities one at a time: what I found, 
why it mattered, what I changed, and how I verified the fix.

### Issue 1: Hardcoded session secret fallback

**What was found:** app.js used `process.env.SESSION_SECRET || '<hardcoded 
hex string>'` when configuring express session. The fallback value was a 
real, usable secret where it can easily be exploited. Therefore I change to the hardcore using crypto.

**Why it mattered:** The session secret is what signs the login cookie, 
proving a session wasn't tampered with. A hardcoded fallback exposed in a 
public repo lets anyone cryptographically forge a valid session cookie for 
any user id, completely bypassing the password check in auth.js. No brute 
force, no failed login attempts, no trace in logs.

**What changed:** The app now reads SESSION SECRET from the environment. 
If it's missing, the app logs a warning and generates a random secret in 
memory for that run only, rather than falling back to a fixed value. The 
tradeoff: if SESSION SECRET isn't set, existing logins are invalidated on 
every server restart, since a new random secret is generated each time. 
Setting SESSION SECRET properly in .env (local) or your hosting platform's 
environment settings avoids this entirely.

**Verified by:** confirming the warning logs correctly when SESSION SECRET 
is removed from .env, and that signin/signup are unaffected either way.

### Issue 2: Session ID not regenerated on login (session fixation)

**What was found:** In auth.js, the /signin route wrote the authenticated 
user's id directly onto req.session (`req.session.userId = user.id`) 
without first regenerating the session. Since express-session assigns a 
session id to every visitor automatically, even before login, the same id 
a person held while anonymous carried over unchanged into their 
authenticated state.

**Why it mattered:** This is a known vulnerability class called session 
fixation. If an attacker can get a victim's browser to adopt a session id 
the attacker already knows (a shared device, a planted cookie, a link 
containing the id), the attacker's copy of that same id becomes valid too 
the moment the victim logs in, since the login data attaches to whatever 
id already existed rather than a fresh one. This does not rely on the 
session secret leaking, it is a separate, independent flaw in the login 
flow itself.

**What changed:** The /signin route now calls `req.session.regenerate()` 
before attaching the authenticated user id. This discards whatever session 
id existed pre-login and issues a completely new one, which is where 
req.session.userId is then set. Any pre-login id an attacker might have 
planted is abandoned and never receives the authenticated session data.

**Verified by:** confirming the connect.sid cookie value changes between 
an anonymous visit and a completed signin.

### Issue 3: Session cookie missing secure and other protective flags

**What was found:** app.js configured express-session without a cookie 
object, leaving secure, sameSite, and maxAge at their defaults. secure 
defaulted to false (cookie sent over both http and https), and there was 
no fixed expiration while the browser stayed open.

**Why it mattered:** Without secure, the session cookie could be sent over 
an unencrypted http connection if one ever occurred, making it readable by 
anyone else on the same network path. Without sameSite, the cookie could 
be attached to background cross site requests (CSRF), letting another 
site trigger actions using a logged in user's session without their 
knowledge. Without maxAge, a session had no absolute expiration while the 
browser remained open.

**What changed:** Added a cookie object to the session config: secure is 
conditional on NODE_ENV so it only enforces https in production and 
doesn't break local http testing, httpOnly is set explicitly (blocks 
client side JavaScript, first party, third party, or injected, from 
reading the cookie), sameSite is set to 'lax' (only sends the cookie on 
direct top level navigation to the site, not background cross site 
requests), and maxAge caps sessions at 24 hours from login.

**Verified by:** inspecting the cookie in browser dev tools to confirm all 
four flags are applied, and confirming signin/session persistence still 
works locally where secure correctly evaluates to false.

### Known limitations of this revamp

This audit covered three issues found in app.js and auth.js. It did not 
yet address: password strength requirements on signup, rate limiting on 
signin attempts, raw error messages being returned to users in a few 
routes, or a discrepancy between scheduler.js (which references 
EMAIL_USER/EMAIL_PASS for a Gmail transporter) and the /remind route 
(which uses RESEND_API_KEY). These are documented here as a known next 
step rather than left unmentioned.

## Known Limitations web development

I used Resend's free tier for email reminders, which only allows sending to my own verified email address until a custom domain is verified, which requires purchasing a domain. Because of this, reminder emails during testing will be delivered to my own inbox rather than the grader's, but the scheduling and matching logic itself is fully functional.

Render's free web service tier uses an ephemeral filesystem, meaning the SQLite database resets on redeploys, restarts, or after 15 minutes of inactivity (free-tier spin-down). To ensure grading access always works, the app automatically seeds a guaranteed test account (professor_test / TestPass123) on every startup, regardless of prior data state.

Will provided my username and email so you can test the email alerts and how the system works via the comment in brightspace

## Notes

I hashed every password with bcrypt before storing it, and I used parameterized SQL queries throughout to prevent SQL injection. Every protected route checks the session individually through a custom requireAuth middleware, so signup and signin stay accessible without a login while everything else stays locked down.