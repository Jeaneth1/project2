var express = require('express');
var router = express.Router();
var requireAuth = require('../middleware/requireAuth');

/* GET home page. */
router.get('/', requireAuth, function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/study', requireAuth, (req,res)=>{
  const {user_topic} = req.body;
  res.send('Question asked ' + user_topic);
});


module.exports = router;
