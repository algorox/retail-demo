require('dotenv').config()
const express = require('express')
const router = express.Router();
var logger = require('../logger')
const deployCLI = require('auth0-deploy-cli');
const fs = require('fs');
const path = require('path');
const os = require('os');
const tenantResolver = require('../tenantResolver')

const tr = new tenantResolver();


router.get("/", async (req, res, next) => {
    logger.verbose("/ requested")
    var accessToken
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.access_token) {
        accessToken = parseJWT(req.userContext.tokens.access_token)
    }
    res.render("migration", {
        accessToken: accessToken
    });
});

router.get("/config_migrated", async (req, res, next) => {
    logger.verbose("/ requested")
    var accessToken
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.access_token) {
        accessToken = parseJWT(req.userContext.tokens.access_token)
    }
    res.render("config_migrated", {
        accessToken: accessToken
    });
});

router.post("/migrate_config", tr.resolveTenant(), async (req, res, next) => {
    //console.log("Migrate Config request received.")
    var from_config;
    var to_config;

    var tenantSettings = tr.getSettings(tr.getTenant(req.headers.host))

    var domain = tenantSettings.issuer.replace('https://', '');
    var domain_trailing_slash = domain.replace('/', '');

    from_config = {
        AUTH0_DOMAIN: process.env.MIGRATION_DOMAIN,
        AUTH0_CLIENT_SECRET: process.env.MIGRATION_SECRET,
        AUTH0_CLIENT_ID: process.env.MIGRATION_CLIENT,
        AUTH0_ALLOW_DELETE: false,
        AUTH0_EXPORT_IDENTIFIERS: true,
        INCLUDED_PROPS: {
            "clients": [ "client_secret", "client_id" ]
          }
    }

    to_config = {
        AUTH0_DOMAIN: domain_trailing_slash,
        AUTH0_CLIENT_SECRET: tenantSettings.clientSecret,
        AUTH0_CLIENT_ID: tenantSettings.clientID,
        AUTH0_ALLOW_DELETE: true,
        AUTH0_EXCLUDED_CLIENTS: ['Auth0 Dashboard Backend Management Client'],
        AUTH0_EXCLUDED: ['tenant', 'clientGrants', 'actions', 'customDomains', 'migrations'],
        INCLUDED_PROPS: {
            "clients": [ "client_secret", "client_id" ]
          }
    }

    // https://github.com/auth0/auth0-deploy-cli/blob/master/docs/excluding-from-management.md

    fs.mkdtemp(path.join(os.tmpdir(), 'tenant-config-'), (err, folder) => {
        if (err) throw err;

        deployCLI.dump({
            output_folder: folder, // temp store for tenant_config.json
            config_file: 'tenant_config.json', //name of output file
            config: from_config   // Set-up (as above)   
        })
            .then((output) => {

                deployCLI.deploy({
                    input_file: folder,  // temp store for tenant_config.json
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
                console.log(err)
                res.status(400)
                res.send({ error: error })
            })
            .catch((error) => {
                console.log(err)
                res.status(400)
                res.send({ error: error })
            })
    });
})

module.exports = router;