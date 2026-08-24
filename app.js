require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
const startScheduler = require('./scheduler');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var authRouter = require('./routes/auth');

//First Issue fixed 
const crypto= require('crypto'); //our fix to no session secret 

let sessionSecret=process.env.SESSION_SECRET;
if(!sessionSecret){
console.warn('No declared session secret! Will created my own sessionSecret')
sessionSecret= crypto.randomBytes(32).toString('hex');
}

var app = express();

startScheduler();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
secret: sessionSecret,
resave:false,
saveUninitialized:false,
cookie:{
secure: process.env.NODE_ENV === 'production',
httpOnly: true, //only the browser's own automatic cookie handling can access it and send it along with requests, no JavaScript, of any origin, first party, third party, or malicious, can read the value directly.
//lax is to ensure that my cookie is sent only in links in the site
//stop request from other site so piggybacking themself with my cookies along 
sameSite: 'lax',
maxAge: 1000 * 60 * 60 * 24 //standard 24 hour the cookie is valid 
}
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/', authRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
res.locals.message = err.message;
res.locals.error = req.app.get('env') === 'development' ? err : {};
res.status(err.status || 500);
res.render('error');
});

module.exports = app;