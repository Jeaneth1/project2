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

/* db needs to explicity hand off to the SQLITE 
    export the db connection so route files can require() and reuse it
*/
module.exports=db;
    