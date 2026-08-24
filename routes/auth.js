const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
/* go to one folder is ..*/
const db = require('../db');

// First piece: the route definition itself.
// router.get('/signin', (req, res) => {...}). Signup needs to be a POST route (since the user 
// is submitting data, not just viewing a page), at a path like /signup.


router.get('/signup', (req, res)=>{
    res.render('signup');
}); /* Get shows us the form  */

router.post('/signup', (req, res)=> { /*Processes the form */
    const {username, email, password} = req.body;
    const hashedPassword= bcrypt.hashSync(password,10);

    /* Using ? as placeholders to prevent SQL injection  */
    try{
        const insert =db.prepare('INSERT INTO users (username,email, password) VALUES(?,?,?)');
        insert.run(username, email, hashedPassword);
        res.redirect('/signin');
    }catch (err){
        res.status(400).send('Signup failed '+ err.message);
    }
});

router.get('/signin',(req, res)=>{
    res.render('signin');
});

router.post('/signin', (req, res) => {
    /* We get the username, password */ 
    const {username, password} = req.body;
    /* We are going to located if we have the username in our database
        We do this by select *gets all the columns from matching rows
        FROM users look in the users table
        WHERE username = ?
            ? is a placeholder so we are comparing it with the username we provided in req.body
        get() since you expect exactly one matching row (username is unique) so we return it 
    */
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);

    if (!user){
        console.log('Signin failed: username not found');
        return res.status(401).send('Invalid username or password');
    }

    //If the user was found in our database now we are going to look at the password

    const passwordMatches = bcrypt.compareSync(password, user.password);

    if (!passwordMatches){
        console.log('Signin failed: wrong password');
        return res.status(401).send('Invalid username or password');
    }

       req.session.regenerate(function(err) {
        if (err) {
            console.log('Session regenerate failed:', err.message);
            return res.status(500).send('Something went wrong signing in');
        }
        req.session.userId = user.id;
        res.redirect('/');
    });

});


module.exports= router;