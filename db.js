/* require(better sqlite) loads the better sqlite 3 npm package
That npm package is a node.js wrapper for the separate SQLite engine and give you the database constructor
which we use to create an actual connection   */
const Database = require('better-sqlite3');

/* actual open connection to the database */
const db = new Database('app.db');

/* 
    this is a block of literal SQL text which JS hands off untouched to SQLITE (better-sqlite3)
    SQLITE is actually creating the table 
*/

db.exec(`
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT not NULL
        )
    `);

db.exec(`
  CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    gemini_response TEXT NOT NULL,
    rating TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports=db;
    