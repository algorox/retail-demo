require('dotenv').config()
const express = require('express')
const router = express.Router();
const passport = require('passport');
const tenantResolver = require('../tenantResolver')
var logger = require('../logger');

const tr = new tenantResolver();

router.get("/", tr.resolveTenant(), async (req, res, next) => {
    logger.verbose("/ requested")

    console.log(req.session)

    var settings
    if (req.session.settings) {
        settings = req.session.settings
    }

    console.log(req.session.demo_name)
    res.render("index", { demoName: req.session.demo_name, tenantSettings: req.session.tenant_settings });
});

router.get('/login', passport.authenticate('auth0', { audience: process.env.AUDIENCE, scope: process.env.SCOPES }), function (req, res) { res.redirect('/portal') })

router.get("/callback", (req, res, next) => {
    passport.authenticate("auth0", (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            return res.redirect("/login");
        }
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }
            res.redirect("/portal");
        });
    })(req, res, next);
});

router.get("/logout", (req, res) => {
    logger.verbose("/logout requested")
    const tenantSettings = tr.getSettings(tr.getTenant(req.headers.host))

    let protocol = "http"
    if (req.secure) {
        protocol = "https"
    }
    else if (req.get('x-forwarded-proto')) {
        protocol = req.get('x-forwarded-proto').split(",")[0]
    }
    const returnUrl = encodeURIComponent(protocol + '://' + req.headers.host + '/')

    let logoutRedirectUrl
    if (tenantSettings.issuer.indexOf('auth0') > 0) {
        //cic tenant
        logoutRedirectUrl = `${tenantSettings.issuer}v2/logout?returnTo=${returnUrl}&client_id=${encodeURIComponent(tenantSettings.clientID)}`
    } else {
        //ocis tenant
        logoutRedirectUrl = `${tenantSettings.issuer}/v1/logout?post_logout_redirect_uri=${returnUrl}&id_token_hint=${encodeURIComponent(req.session.passport.user.tokens.id_token)}`
    }

    req.session.destroy()
    res.redirect(logoutRedirectUrl)
})

router.get("/error", async (req, res, next) => {
    logger.warn(req)
    var msg = "An error occured, unable to process your request."
    if (req.session.errorMsg) {
        msg = req.session.errorMsg
        req.session.errorMsg = null
    }
    res.render("error", {
        msg: msg
    });
})

module.exports = router;
