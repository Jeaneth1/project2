/* requireAuth.js only job is checking req.session.userID and req.session already exist auto on every req 
once express-session middle ware ran. We need to check whether a value was already stored in 
the session at sign time 
*/

function requireAuth(req,res,next){
    /* if we are !undefined we need to be redirected to log in else if !3 it is false so we go to next */
    if(!req.session.userId){
        return res.redirect('/signin');
    }
    next();
}

module.exports = requireAuth;