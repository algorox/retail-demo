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
        if (req.userContext) {
            return next()
        }
        else {
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

router.get("/portal", ensureAuthenticated(), async (req, res, next) => {
    logger.verbose("/ requested")

    var accessToken, profile
    if (req.userContext.at) {
        accessToken = parseJWT(req.userContext.at)
    }
    if (req.userContext.profile) {
        profile = req.userContext.profile
    }

    var domain, domain_trailing_slash, tenantSettings

    tenantSettings = tr.getSettings(tr.getTenant(req.headers.host))
    domain = tenantSettings.issuer.replace('https://', '');
    domain_trailing_slash = domain.replace('/', '');
    domain_cic_domain = domain_trailing_slash.replace('.cic-demo-platform.auth0app.com', '');

    res.render("portal", {
        tenant: 'https://manage.cic-demo-platform.auth0app.com/dashboard/pi/' + domain_cic_domain
    });
});

const arrayOfHTTPErrors = [500, 501, 400, 401, 403, 404, 409, 422, 429];

const handleRequests = (url, body, type, accessToken) => {

    return new Promise((resolve, reject) => {

        const options = {
            url: url,
            json: true,
            method: type,
            body: body,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
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

router.post("/create_legacy_demo", ensureAuthenticated(), async (req, res, next) => {

    var check_url, check_data, tenant_url, tenant_data, demo_url, demo_name, demo_data, get_type, post_type, accessToken, tenantSettings;
    var domain, domain_trailing_slash

    tenantSettings = tr.getSettings(tr.getTenant(req.headers.host))

    get_type = 'GET'
    post_type = 'POST'
    accessToken = req.userContext.at

    demo_name = req.body.demo_name || 'test'

    check_url = 'https://portal.auth0.cloud/api/demos/' + demo_name + '/is-valid'
    tenant_url = 'https://portal.auth0.cloud/api/tenants';
    demo_url = 'https://portal.auth0.cloud/api/demos';

    domain = tenantSettings.issuer.replace('https://', '');
    domain_trailing_slash = domain.replace('/', '');

    tenant_data = {
        "domain": domain_trailing_slash,
        "clientId": tenantSettings.clientID,
        "clientSecret": tenantSettings.clientSecret,
    }

    handleRequests(check_url, check_data, get_type, accessToken)
        .then((output) => {
            handleRequests(tenant_url, tenant_data, post_type, accessToken)
                .then((output) => {

                    var demo_template_id, demo_template_name;

                    if (req.body.demo_type === "Property0") {
                        demo_template_id = "6258876198054a2a27ab56ba",
                            demo_template_name = "PropertyZero"
                    }


                    if (req.body.demo_type === "Travel0") {
                        demo_template_id = "61e3d56571224f67caf205e1",
                            demo_template_name = "TravelZero"
                    }

                    demo_data = {
                        "demoName": req.body.demo_name,
                        "tenantId": output.id,
                        "demoTemplate": { "id": demo_template_id, "title": demo_template_name },
                        "demoMetadata": {},
                        "deploy": true
                    }

                    handleRequests(demo_url, demo_data, post_type, accessToken)
                        .then((output) => {

                            res.status(200)
                            res.send({
                                "Demo Creation: ": output
                            });

                        }).catch((err) => {
                            console.log(err);
                            res.status(err.error)
                            res.send({
                                "Demo Creation ": err
                            });
                        })


                }).catch((err) => {

                    if (err.error_description.error.message === "A tenant with the same name already exists") {


                        var tenantSettings, url, data, type, accessToken, domain, domain_trailing_slash, tenant_response;;

                        tenantSettings = tr.getSettings(tr.getTenant(req.headers.host))

                        url = 'https://portal.auth0.cloud/api/tenants'
                        type = 'GET'
                        accessToken = req.userContext.at

                        domain = tenantSettings.issuer.replace('https://', '');
                        domain_trailing_slash = domain.replace('/', '');

                        handleRequests(url, data, type, accessToken)
                            .then((output) => {



                                for (let i = 0; i < output.results.length; i++) {
                                    let obj = output.results[i];

                                    if (obj.domain === domain_trailing_slash) {

                                        tenant_response = {
                                            "Tenant_Link": output.results[i].dashboardLink,
                                            "Tenant_Name": output.results[i].domain,
                                            "Tenant_ID": output.results[i].id,
                                            "Linked_Demo_Name": output.results[i].demoName,
                                        }

                                    }
                                }

                                if (tenant_response) {


                                    var demo_template_id, demo_template_name;

                                    if (req.body.demo_type === "Property0") {
                                        demo_template_id = "6258876198054a2a27ab56ba",
                                            demo_template_name = "PropertyZero"
                                    }


                                    if (req.body.demo_type === "Travel0") {
                                        demo_template_id = "61e3d56571224f67caf205e1",
                                            demo_template_name = "TravelZero"
                                    }

                                    demo_data = {
                                        "demoName": req.body.demo_name,
                                        "tenantId": tenant_response.Tenant_ID,
                                        "demoTemplate": { "id": demo_template_id, "title": demo_template_name },
                                        "demoMetadata": {},
                                        "deploy": true
                                    }

                                    handleRequests(demo_url, demo_data, post_type, accessToken)
                                        .then((output) => {

                                            res.status(200)
                                            res.send({
                                                "Demo Creation: ": output
                                            });

                                        }).catch((err) => {
                                            console.log(err);
                                            res.status(err.error)
                                            res.send({
                                                "Demo Creation ": err
                                            });
                                        })

                                }

                                else {
                                    res.status(200)
                                    res.send({
                                        "Tenants": "Not Found"
                                    });

                                }

                            })


                            .catch((err) => {
                                console.log(err);
                                res.status(err.error)
                                res.send({
                                    "Tenants": err
                                });;
                            });

                    }

                })

        }).catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send({
                "Demo Creation ": err
            });
        })

})

router.post("/get_legacy_demo", ensureAuthenticated(), async (req, res, next) => {

    var tenantSettings, url, data, type, accessToken, domain, domain_trailing_slash, tenant_response, demo_response;

    tenantSettings = tr.getSettings(tr.getTenant(req.headers.host))

    url = 'https://portal.auth0.cloud/api/tenants'
    demo_url = 'https://portal.auth0.cloud/api/demos'
    type = 'GET'
    accessToken = req.userContext.at

    domain = tenantSettings.issuer.replace('https://', '');
    domain_trailing_slash = domain.replace('/', '');

    handleRequests(url, data, type, accessToken)
        .then((output) => {



            for (let i = 0; i < output.results.length; i++) {
                let obj = output.results[i];

                if (obj.domain === domain_trailing_slash) {

                    tenant_response = {
                        "Tenant_Link": output.results[i].dashboardLink,
                        "Tenant_Name": output.results[i].domain,
                        "Tenant_ID": output.results[i].id,
                        "Linked_Demo_Name": output.results[i].demoName,
                    }

                }
            }

            if (tenant_response) {

                handleRequests(demo_url, data, type, accessToken)
                    .then((output) => {


                        for (let i = 0; i < output.results.length; i++) {
                            let obj = output.results[i];

                            if (obj.tenantId === tenant_response.Tenant_ID) {

                                demo_response = output.results[i];

                            }
                        }

                        if(!demo_response){

                            res.status(200)
                            res.send({
                                "Demo": "No demo added yet"
                            });
                        }

                        else {

                            var demo_info;

                            var applications = [];

                            demo_info = {
                                "demo_id": demo_response.id,
                                "tenant_id": demo_response.tenantId,
                                applications
                            }

                            for (let i = 0; i < demo_response.applications.length; i++) {
                                let obj = demo_response.applications[i];
    
                                if (obj.url) {

                                    applications.push(obj.url);
    
                                }
                            }
                            res.status(200)
                            res.send({
                                "Demo": demo_info
                            });
                        }

                    }).catch((err) => {
                        console.log(err);
                        res.status(err.error)
                        res.send({
                            "Demo": err
                        });
                    })




            }

            else {
                res.status(200)
                res.send({
                    "Demo": "Not Found"
                });

            }

        })


        .catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send({
                "Demo": err
            });;
        });

})

router.post("/get_legacy_tenants", ensureAuthenticated(), async (req, res, next) => {

    var tenantSettings, url, data, type, accessToken, domain, domain_trailing_slash;

    tenantSettings = tr.getSettings(tr.getTenant(req.headers.host))

    url = 'https://portal.auth0.cloud/api/tenants'
    type = 'GET'
    accessToken = req.userContext.at

    domain = tenantSettings.issuer.replace('https://', '');
    domain_trailing_slash = domain.replace('/', '');

    handleRequests(url, data, type, accessToken)
        .then((output) => {

            var response;

            for (let i = 0; i < output.results.length; i++) {
                let obj = output.results[i];

                if (obj.domain === domain_trailing_slash) {

                    response = {
                        "Tenant_Link": output.results[i].dashboardLink,
                        "Tenant_Name": output.results[i].domain,
                        "Tenant_ID": output.results[i].id,
                        "Linked_Demo_Name": output.results[i].demoName,
                    }

                }

                else {

                    response = {
                        "Tenants": "Not Found"
                    }
                }

            }

            if (req.body.clear) {
                req.body.tenant_id = response.Tenant_ID
                req.body.linked_demo_name = response.Linked_Demo_Name
                next()
            }

            else {
                res.status(200)
                res.send({
                    "Tenants": response
                });

            }

        })
        .catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send({
                "Tenants": err
            });;
        });
})

router.post("/get_legacy_tenants", ensureAuthenticated(), async (req, res, next) => {

    var url, data, type, accessToken;

    url = 'https://portal.auth0.cloud/api/demos'
    type = 'GET'
    clear_type = 'DELETE'
    accessToken = req.userContext.at
    var clear_demo_url, clear_tenant_url;

    handleRequests(url, data, type, accessToken)
        .then((output) => {

            for (let i = 0; i < output.results.length; i++) {
                let obj = output.results[i];

                if (obj.tenantId === req.body.tenant_id) {

                    clear_demo_url = 'https://portal.auth0.cloud/api/demos/' + output.results[i].id
                    clear_tenant_url = 'https://portal.auth0.cloud/api/tenants/' + req.body.tenant_id

                }

            }

            if (clear_demo_url) {

                handleRequests(clear_demo_url, data, clear_type, accessToken)
                    .then((output) => {

                        res.status(200)
                        res.send({
                            "Demo": "Cleared"
                        });

                        // handleRequests(clear_tenant_url, data, clear_type, accessToken)
                        //     .then((output) => {

                        //         res.status(200)
                        //         res.send({
                        //             "Demo": "Deleted"
                        //         });

                        //     }).catch((err) => {
                        //         console.log(err);
                        //         res.status(err.error)
                        //         res.send({
                        //             "Demo": err
                        //         });
                        //     });

                    }).catch((err) => {
                        console.log(err);
                        res.status(err.error)
                        res.send({
                            "Demo": err
                        });
                    });

            }

            else {

                res.status(200)
                res.send({
                    "Demo": "Demo Not Found"
                });
            }

        })
        .catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send({
                "Demo": err
            });
        });

})

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