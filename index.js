require('dotenv').config()
const express = require('express')
const exphbs = require('express-handlebars');
const session = require('express-session')
const passport = require('passport');
const tenantResolver = require('./tenantResolver')
var logger = require('./logger');
const auth0 = require('auth0-deploy-cli')
const okta = require('@okta/okta-sdk-nodejs');
const deployCLI = require('auth0-deploy-cli');
const fs = require('fs');
const path = require('path');
const os = require('os');
const request = require('request')
const queryString = require('query-string')
const apiTokenVerfier = require('express-oauth2-jwt-bearer')

const PORT = process.env.PORT || 3000;
app = express();
app.use(express.json());

var hbs = exphbs.create();

app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

app.use('/static', express.static('static'));
app.use('/scripts', express.static(__dirname + '/node_modules/clipboard/dist/'));

app.use(session({
    cookie: { httpOnly: true },
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: true
}));

app.use(passport.initialize({ userProperty: 'userContext' }));
app.use(passport.session());
passport.serializeUser((user, next) => {
    next(null, user);
});

passport.deserializeUser((obj, next) => {
    next(null, obj);
});

function ensureAuthenticated() {
    return async (req, res, next) => {
        if (req.isAuthenticated() && req.userContext != null) {
            return next();
        }
        res.redirect("/login")
    }
}

const tr = new tenantResolver();
const router = express.Router();

router.get("/", tr.resolveTenant(), async (req, res, next) => {
    logger.verbose("/ requested")
    var settings
    if (req.session.settings) {
        settings = req.session.settings
    }
    res.render("index", { demoName: tr.getTenant(req.headers.host), tenantSettings: settings });
});

router.get("/protected", ensureAuthenticated(), async (req, res, next) => {
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

router.get("/portal", ensureAuthenticated(), async (req, res, next) => {
    logger.verbose("/ requested")

    var accessToken, profile
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.access_token) {
        accessToken = parseJWT(req.userContext.tokens.access_token)
    }
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.id_token) {
        profile = parseJWT(req.userContext.tokens.id_token)
    }

    res.render("portal", {
        pic: profile.picture || 'https://demo-eng-public-static-resources.s3.amazonaws.com/okta-icon.png',
        first_name: profile.given_name || 'record not found',
        surname: profile.family_name || 'record not found',
        last_updated: profile.updated_at || 'record not found',
        user_meta: JSON.stringify(profile.user_metadata) || 'looks like you need to add your favorite color',
        accessToken: req.userContext.tokens.access_token || 'no access token returned',
        domain: accessToken.iss,
        baseUrl: 'http://storytime-stepup-121122.localhost:3000',
        client: accessToken.azp,
        sub: accessToken.sub
    });
});

const handleRequests = (url, body, type, accessToken) => {

    return new Promise((resolve, reject) => {

        const options = {
            url: url,
            json: true,
            method: type,
            body: body,
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        };
        request(options, function (error, response, body) {

            if (error) {
                customError = {
                    error: 500,
                    error_description: error
                }
                reject(customError);
            }

            if (response) {

                if (arrayOfHTTPErrors.includes(response.statusCode)) {

                    customError = {
                        error: response.statusCode || 500,
                        error_description: response.body || 'No Description Provided'
                    }

                    reject(customError)
                }
                resolve(body);
            }

        })
    });
}

const arrayOfHTTPErrors = [500, 501, 400, 401, 403, 404, 422, 429];

router.post("/create_legacy_demo", ensureAuthenticated(), async (req, res, next) => {

    var url, data, type, accessToken;

    data = {
        user_metadata: {
            favorite_color: req.body.favorite_color
        }
    }

    handleRequests(url, data, type, accessToken)
        .then((output) => {
            res.status(200)
            res.send({
                "Favorite Color Set to: ": req.body.favorite_color,
                "Message": ' Logout and re-login to see the update'
            });
        })
        .catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send('/error?' + err.error + '&error_description=' + err.error_description);
        });
})

router.post("/get_legacy_demo", ensureAuthenticated(), async (req, res, next) => {

    var url, data, type, accessToken;

    url = 'https://portal.staging.auth0.cloud/api/tenants'
    data = {};
    type = 'GET'
    accessToken = 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InBtTkJ1TWRBcVhQMUZNSERfamhyWiJ9.eyJodHRwczovL3N0YWdpbmcuYXV0aDAuY2xvdWQvZW1haWwiOiJqdWxpYW4ubHl3b29kQG9rdGEuY29tIiwibG9naW4iOiJqdWxpYW4ubHl3b29kQG9rdGEuY29tIiwiaHR0cHM6Ly9hdXRoLm9rdGFkZW1vLmVuZ2luZWVyaW5nL2Nvbm5lY3Rpb24vIjoiZW1wbG95ZWUiLCJpc3MiOiJodHRwczovL3ZhbmRlbGF5LWluZHVzdHJpZXMudXMuYXV0aDAuY29tLyIsInN1YiI6Im9pZGN8T2t0YXwwMHUxamJnNWdwZDltbmpiOTFkOCIsImF1ZCI6WyJodHRwczovL3BvcnRhbC5zdGFnaW5nLmF1dGgwLmNsb3VkL2FwaSIsImh0dHBzOi8vdmFuZGVsYXktaW5kdXN0cmllcy51cy5hdXRoMC5jb20vdXNlcmluZm8iXSwiaWF0IjoxNjcwNDg1MDA5LCJleHAiOjE2NzA1NzE0MDksImF6cCI6InY3dHh0aFBGUVJ6NDJNWU1wVFd2VGZpNHIxaThSRTJQIiwic2NvcGUiOiJvcGVuaWQgcHJvZmlsZSBlbWFpbCJ9.D-ZHJuvUz0-icQo9f9C3w6dLiv2QFc2ex_rSeKIJaBcimnlheEfhC7oTCpKApUuemHZ-APtqPmZ_VHJ5eCrrSxMFNGaOxAKErUcdt_Y8uiHMkgFeoPFZXeXUDYw2U1U7lPrQr-LRQ3vRo2BZd-VAuSBkHwoDPpBl1Q03VwB3R7AW2tiL9A_QBMKKpprF_3Y-BmpJ9cFU_WP7Qk6S8_PYIpbza-rBwTogFqoS07tyYyAB8X7Z0ql6jsW_XwN-qI5nt_Y8zaVnbap6bnGqg_VZGXhyoLNf5qGc5l--Vwuvr4v1HaGIvQBVOmDhqjBxse4PPbLo1DgQBZ9i1gjos2y5gg'

    handleRequests(url, data, type, accessToken)
        .then((output) => {
            res.status(200)
            res.send({
                "Tenants ": output
            });
        })
        .catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send({
                "Tenants ": err
            });;
        });
})

router.get("/download", function (req, res, next) {
    //this allows the direct download of the src as a zip removing the need to make the repo public
    //the file at this location should be updated before deploy but never checked into git
    const file = `./demoapi-node-quickstart.zip`;
    res.download(file);
})

router.get('/login', tr.resolveTenant(), function (req, res, next) {
    passport.authenticate(tr.getTenant(req.headers.host), { audience: process.env.API_AUDIENCE, scope: process.env.SCOPES })(req, res, next)
})
router.get('/callback', function (req, res, next) {
    passport.authenticate(
        tr.getTenant(req.headers.host),
        { successRedirect: '/portal', failureRedirect: '/error' })
        (req, res, next)
})
router.get("/logout", ensureAuthenticated(), (req, res) => {
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

//these webhooks consume events from the demo API
router.post("/hooks/request", async (req, res, next) => {
    console.log("Demo API request webhook recieved.")
    console.log(JSON.stringify(req.body))
    res.sendStatus(202)
})
router.post("/hooks/create", async (req, res, next) => {
    console.log("Demo API create webhook recieved.")
    console.log(JSON.stringify(req.body))
    //deploy takes longer than 3 seconds return 202
    //roadmap feature to send back status
    res.sendStatus(202)
    if (req.body.idp.type === 'customer-identity') {
        console.log("Applying Auth0 configuration.")
        try {
            await auth0.deploy({
                input_file: './configure/customer-identity/tenant.yaml',
                config: {
                    AUTH0_DOMAIN: new URL(req.body.idp.management_credentials.tokenEndpoint).hostname,
                    AUTH0_CLIENT_ID: req.body.idp.management_credentials.clientId,
                    AUTH0_CLIENT_SECRET: req.body.idp.management_credentials.clientSecret,
                }
            })
            console.log(("apply complete"))
        } catch (err) {
            console.log('apply failed')
            console.log(err)
        }
    }
    else {
        console.log("Applying Okta configuration.")
        var orgUrl = new URL(req.body.idp.management_credentials.tokenEndpoint)
        orgUrl.pathname = ""
        try {
            const client = new okta.Client({
                orgUrl: orgUrl.toString(),
                authorizationMode: 'PrivateKey',
                clientId: req.body.idp.management_credentials.clientId,
                scopes: ['okta.groups.manage', 'okta.groups.read', 'okta.apps.read', 'okta.apps.manage'],
                privateKey: req.body.idp.management_credentials.clientJWKS.keys[0],
                keyId: 'demoplatform'
            });
            client.listGroups({ q: "everyone", limit: 1 })
                .each(group => {
                    client.createApplicationGroupAssignment(req.body.application.oidc_configuration.client_id, group.id)
                }
                )
            console.log(("apply complete"))
        } catch (err) {
            console.log('apply failed')
            console.log(err)
        }
    }
})
router.post("/hooks/update", async (req, res, next) => {
    console.log("Demo API update webhook recieved.")
    console.log(JSON.stringify(req.body))
    if (req.body && req.body.demonstration && req.body.demonstration.name) {
        //this removes the demo from the cache so that the latest settings are pulled on next request
        //alternatively the tenant could be updated from the application.settings object in this hook
        tr.removeTenant(req.body.demonstration.name)
    }
    res.sendStatus(202)
})
router.post("/hooks/destroy", async (req, res, next) => {
    console.log("Demo API destroy webhook recieved.")
    console.log(JSON.stringify(req.body))
    if (req.body && req.body.demonstration && req.body.demonstration.name) {
        //this removes the demo from the cache so if it is re-added the new configuration is used
        tr.removeTenant(req.body.demonstration.name)
    }
    res.sendStatus(202)
})

app.use(router)

app.listen(PORT, () => logger.info('Application started'));

function parseJWT(token) {
    var atob = require('atob');
    if (token != null) {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace('-', '+').replace('_', '/');
        try {
            return JSON.parse(atob(base64))
        } catch (err) {
            return "Invalid or empty token was parsed"
        }
    } else {
        return "Invalid or empty token was parsed"
    }
}