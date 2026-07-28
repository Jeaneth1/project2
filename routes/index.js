const db = require('../db');
var express = require('express');
var router = express.Router();
var requireAuth = require('../middleware/requireAuth');

/* GET home page. */
router.get('/', requireAuth, function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/study', requireAuth, async(req,res)=>{
  const {user_topic, question_count, resource_count} = req.body;
  const numQuestions = question_count || 5;
  const numResources = resource_count || 3;
  
  const prompt = `Explain the topic "${user_topic}" clearly, then provide ${numQuestions} practice questions to test understanding, and recommend ${numResources} relevant learning resources appropriate for this specific topic (could be websites, courses, YouTube channels, books, or practice platforms  whatever fits best).`;

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
    const geminiText = data.candidates[0].content.parts[0].text;

    const insertSession= db.prepare('INSERT INTO study_sessions (user_id, topic, gemini_response) VALUES (?,?,?)');
    insertSession.run(req.session.userId, user_topic, geminiText);

    res.send(geminiText);
  } catch (err){
    res.status(500).send('Gemini request failed: ' + err.message);
  }
});

router.get('/history', requireAuth, (req, res)=>{
  const sessions = db.prepare('SELECT * FROM study_sessions WHERE user_id = ?').all(req.session.userId);
  res.render('history', { sessions: sessions });
});

router.post('/history/:id/delete', requireAuth, (req, res) => {
  const deleteSession = db.prepare('DELETE FROM study_sessions WHERE id = ? AND user_id = ?');
  deleteSession.run(req.params.id, req.session.userId);
  res.redirect('/history');
});

module.exports = router;
