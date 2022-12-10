const express = require('express');
const router = express.Router();

router.get("/", async (req, res, next) => {
    logger.verbose("/ requested")
    var accessToken, profile
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.access_token) {
        accessToken = parseJWT(req.userContext.tokens.access_token)
    }
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.id_token) {
        profile = parseJWT(req.userContext.tokens.id_token)
    }
    res.render("protected", {
        profile: profile,
        accessToken: accessToken
    });
})

module.exports = router;