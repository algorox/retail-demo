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

router.get("/profile", ensureAuthenticated(), async (req, res, next) => {
    logger.verbose("/ requested")
    var accessToken, profile
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.access_token) {
        accessToken = parseJWT(req.userContext.tokens.access_token)
    }
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.id_token) {
        profile = parseJWT(req.userContext.tokens.id_token)
    }
    res.render("profile", {
        profile: profile,
        accessToken: accessToken
    });
});

router.get("/download", function (req, res, next) {
    //this allows the direct download of the src as a zip removing the need to make the repo public
    //the file at this location should be updated before deploy but never checked into git
    const file = `./demoapi-node-quickstart.zip`;
    res.download(file);
})

router.get('/login', tr.resolveTenant(), function (req, res, next) {
    passport.authenticate(tr.getTenant(req.headers.host), { audience: 'urn:my-api', scope: process.env.SCOPES })(req, res, next)
})
router.get('/callback', function (req, res, next) {
    passport.authenticate(
        tr.getTenant(req.headers.host),
        { successRedirect: '/profile', failureRedirect: '/error' })
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

//////////////////////
//MIGRATION SERVICES//
//////////////////////

app.use(express.urlencoded({ extended: true }));

router.get("/migration", ensureAuthenticated(), async (req, res, next) => {
    logger.verbose("/ requested")
    var accessToken
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.access_token) {
        accessToken = parseJWT(req.userContext.tokens.access_token)
    }
    res.render("migration", {
        accessToken: accessToken
    });
});

router.get("/config_migrated", ensureAuthenticated(), async (req, res, next) => {
    logger.verbose("/ requested")
    var accessToken
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.access_token) {
        accessToken = parseJWT(req.userContext.tokens.access_token)
    }
    res.render("config_migrated", {
        accessToken: accessToken
    });
});

router.post("/migrate_config", ensureAuthenticated(), async (req, res, next) => {
    //console.log("Migrate Config request received.")
    console.log(JSON.stringify(req.body))
    var from_config;
    var to_config;

    from_config ={
        AUTH0_DOMAIN: req.body.from_domain,
        AUTH0_CLIENT_SECRET: req.body.from_secret,
        AUTH0_CLIENT_ID: req.body.from_client,
        AUTH0_ALLOW_DELETE: false
    }

    to_config ={
        AUTH0_DOMAIN: req.body.to_domain,
        AUTH0_CLIENT_SECRET: req.body.to_secret,
        AUTH0_CLIENT_ID: req.body.to_client,
        AUTH0_ALLOW_DELETE: false,
        AUTH0_EXCLUDED_CLIENTS: ['Auth0 Dashboard Backend Management Client'],
        AUTH0_EXCLUDED: ['tenant'],
    }


    // from_config = {
    //     AUTH0_DOMAIN: process.env.FROM_DOMAIN,
    //     AUTH0_CLIENT_SECRET: process.env.FROM_CLIENT_SECRET,
    //     AUTH0_CLIENT_ID: process.env.FROM_CLIENT_ID,
    //     AUTH0_ALLOW_DELETE: false
    // }

    // to_config = {
    //     AUTH0_DOMAIN: process.env.TO_DOMAIN,
    //     AUTH0_CLIENT_SECRET: process.env.TO_CLIENT_SECRET,
    //     AUTH0_CLIENT_ID: process.env.TO_CLIENT_ID,
    //     AUTH0_ALLOW_DELETE: false,
    //     AUTH0_EXCLUDED_CLIENTS: ['Auth0 Dashboard Backend Management Client'],
    //     AUTH0_EXCLUDED: ['tenant'],
    // }

    // https://github.com/auth0/auth0-deploy-cli/blob/master/docs/excluding-from-management.md

    fs.mkdtemp(path.join(os.tmpdir(), 'tenant-config-'), (err, folder) => {
        if (err) throw err;

        deployCLI.dump({
            output_folder: folder,   // temp store for tenant_config.json
            config_file: 'tenant_config.json', //name of output file
            config: from_config   // Set-up (as above)   
        })
            .then((output) => {

                deployCLI.deploy({
                    input_file: folder,  // Input file for directory, change to .yaml for YAML
                    config_file: 'tenant_config.json', // Option to a config json
                    config: to_config,   // Option to sent in json as object
                })
            })
            .then((output) => {
                res.status(200)
                res.send(
                    {
                        'output': output,
                        'tenant_migrated_from': from_config.AUTH0_DOMAIN,
                        'tenant_migrated_to': to_config.AUTH0_DOMAIN
                    })
            })
            .catch((error) => {
                res.status(400)
                res.send({ error: error })
            })
            .catch((error) => {
                res.status(400)
                res.send({ error: error })
            })
    });
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