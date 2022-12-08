require('dotenv').config()
const express = require('express')
const exphbs = require('express-handlebars');
const session = require('express-session')
const passport = require('passport');
const tenantResolver = require('./tenantResolver')
var logger = require('./logger');
const auth0 = require('auth0-deploy-cli')
const okta = require('@okta/okta-sdk-nodejs');
const request = require('request')
const Auth0Strategy = require('passport-auth0');

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
    resave: false
}));

const strategy = new Auth0Strategy(
    {
        domain: process.env.DOMAIN,
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        callbackURL: process.env.CALLBACK_URL
    },
    function (accessToken, refreshToken, extraParams, profile, done) {

        var user = {
            at: accessToken,
            profile: profile
        }
        //req.session.access_token = accessToken;
        //req.session.profile = profile;
        //req.session.refresh_token = refreshToken;
        // req.session.expires_in = extraParams.expires_in;
        // req.session.id_token = extraParams.id_token;
        return done(null, user);
    }
);

passport.use(strategy);
app.use(passport.initialize({userProperty: 'userContext'}));
app.use(passport.session());
passport.serializeUser((user, next) => {
    next(null, user);
});

passport.deserializeUser((obj, next) => {
    next(null, obj);
});

function ensureAuthenticated() {
    return async (req, res, next) => {
        console.log(req.userContext)
         if (req.userContext) {
            return next()
        }
        else{
            res.redirect("/login")
        }
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

router.get('/test', )

router.get("/portal",ensureAuthenticated(), async (req, res, next) => {
    logger.verbose("/ requested")

    var accessToken, profile
    if (req.userContext.at) {
        accessToken = parseJWT(req.userContext.at)
    }
    if (req.userContext.profile) {
        profile = req.userContext.profile
    }

    res.render("portal", {
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
    type = 'GET'
    accessToken = req.userContext.at

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

router.get('/login', passport.authenticate('auth0',{audience: process.env.AUDIENCE, scope: process.env.SCOPES}),function(req,res){res.redirect('/portal')})


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