require('dotenv').config()
const express = require('express')
const router = express.Router();
var logger = require('../logger')
const deployCLI = require('auth0-deploy-cli');
const fs = require('fs');
const path = require('path');
const os = require('os');
const tenantResolver = require('../tenantResolver')
const handleRequests = require('../utils/requests').handleRequests;
const handleMongoRequests = require('../utils/requests').handleMongoRequests;
const zip = require('child_process')

const tr = new tenantResolver();

router.get("/", async (req, res, next) => {
    logger.verbose("/ requested")
    var accessToken
    if (req.userContext && req.userContext.tokens && req.userContext.tokens.access_token) {
        accessToken = parseJWT(req.userContext.tokens.access_token)
    }
    res.render("migration", {
        accessToken: accessToken,
        tenant: 'https://manage.cic-demo-platform.auth0app.com/dashboard/pi/' + domain_cic_domain
    });
});

router.post("/migrate_config", async (req, res, next) => {

    var check_url = 'https://portal.auth0.cloud/api/demos/' + req.body.migrationDemoName + '/is-valid';
    var check_data;
    var get_type = 'GET'
    var accessToken = req.userContext.at

    handleRequests(check_url, check_data, get_type, accessToken)
        .then((output) => {
            console.log('no demo found')
            res.status(200)
            res.send({ "Note": "No demo found with the name: " + req.body.migrationDemoName })
        }).catch((error) => {
            console.log(error)

            if (error.error = 409) {
                next()
            }
            else {
                res.status(400)
                res.send({ error: error })
            }
        })
})


router.post("/migrate_config", tr.resolveTenant(), async (req, res, next) => {

    var post_type = 'POST'
    var get_demos_url = 'https://data.mongodb-api.com/app/data-laqlc/endpoint/data/v1/action/findOne'

    var tenantSettings = tr.getSettings(tr.getTenant(req.headers.host))

    req.body.tenant_settings = tenantSettings

    var domain = tenantSettings.issuer.replace('https://', '');
    var domain_trailing_slash = domain.replace('/', '');

    get_tenant_data =
    {
        collection: "tenants",
        database: "platform",
        dataSource: "Cluster-Prod",
        filter: { "domain": domain_trailing_slash }
    }

    handleMongoRequests(get_demos_url, get_tenant_data, post_type).then((output) => {

        //if (output.document.hasOwnProperty('demoOkta') && req.body.download != "true") {
        if (output.document.hasOwnProperty('test') && req.body.download != "true") {
            res.status(200)
            res.send({ "Note": "The associated demo.okta CIC tenant (" + domain_trailing_slash + ") has already been used to create/migrate a Travel0 or Property0 demo. To reduce conflicts / issues, please spin up a fresh demo.okta tenant and go from there. You are still able to download your config" })
        }

        else {
            next()
        }
    }).catch((error) => {
        console.log(error)
        res.status(400)
        res.send({ error: error })
    })

})

router.post("/migrate_config", async (req, res, next) => {

    var post_type = 'POST'
    var get_demos_url = 'https://data.mongodb-api.com/app/data-laqlc/endpoint/data/v1/action/findOne'

    get_demo_tenant_data =
    {
        collection: "tenants",
        database: "platform",
        dataSource: "Cluster-Prod",
        filter: { "demoName": req.body.migrationDemoName }
    }

    handleMongoRequests(get_demos_url, get_demo_tenant_data, post_type).then((output) => {

        //https://github.com/auth0/auth0-deploy-cli/blob/master/docs/excluding-from-management.md

        //fs.mkdtemp(path.join(os.tmpdir(), 'tenant-config-'), (err, folder) => {

        var from_config;
        from_config = {
            // AUTH0_DOMAIN: output.document.domain,
            // AUTH0_CLIENT_SECRET: output.document.clientSecret,
            // AUTH0_CLIENT_ID: output.document.clientId,   
            AUTH0_DOMAIN: process.env.MIGRATION_DOMAIN,
            AUTH0_CLIENT_SECRET: process.env.MIGRATION_SECRET,
            AUTH0_CLIENT_ID: process.env.MIGRATION_CLIENT,
            AUTH0_ALLOW_DELETE: false,
            INCLUDED_PROPS: {
                "clients": ["client_secret", "client_id"]
            }
        }

        fs.mkdir('./migration_files', { recursive: true }, (err) => {
            if (err) throw err;

            deployCLI.dump({
                output_folder: './migration_files', // temp store for tenant_config.json
                config_file: 'tenant_config.json', //name of output file
                config: from_config,
                //format: "yaml"  // Set-up (as above)   
            })
                .then((output) => {

                    if (req.body.download === 'true') {

                        zip.execSync(`zip -r archive *`, {
                            cwd: './migration_files'
                        });

                        res.status(200)
                        res.send({ url: req.headers.host + '/migration_files/archive.zip' })
                    }

                    else {
                        next()
                    }

                })
                .catch((error) => {
                    console.log(error)
                    res.status(400)
                    res.send({ error: error })
                })

        });

    })
        .catch((error) => {
            console.log(error)
            res.status(400)
            res.send({ error: error })
        })

})


router.post("/migrate_config", async (req, res, next) => {

    var to_config;

    tenantSettings = req.body.tenant_settings

    var domain = tenantSettings.issuer.replace('https://', '');
    var domain_trailing_slash = domain.replace('/', '');

    to_config = {
        AUTH0_DOMAIN: domain_trailing_slash,
        AUTH0_CLIENT_SECRET: tenantSettings.clientSecret,
        AUTH0_CLIENT_ID: tenantSettings.clientID,
        AUTH0_ALLOW_DELETE: true,
        AUTH0_EXCLUDED_CLIENTS: ['Auth0 Dashboard Backend Management Client'],
        AUTH0_EXCLUDED: ['tenant', 'clientGrants', 'actions', 'customDomains', 'migrations'],
        INCLUDED_PROPS: {
            "clients": ["client_secret", "client_id"]
        }
    }
    // https://github.com/auth0/auth0-deploy-cli/blob/master/docs/excluding-from-management.md

    deployCLI.deploy({
        input_file: './migration_files',
        config_file: 'tenant_config.json',
        config: to_config,
        //format: 'yaml'
    })
        .then((output) => {
            next()
        })
        .catch((error) => {
            console.log(error)
            res.status(400)
            res.send({ error: error })
        })
})

router.post("/migrate_config", async (req, res, next) => {

    tenantSettings = req.body.tenant_settings

    var data
    var get_type = 'GET'
    var get_clients_url = tenantSettings.issuer + 'api/v2/clients'

    auth_data = {
        grant_type: 'client_credentials',
        client_id: tenantSettings.clientID,
        client_secret: tenantSettings.clientSecret,
        audience: tenantSettings.issuer + 'api/v2/'
    }

    handleRequests(tenantSettings.tokenURL, auth_data, 'POST')
        .then((output) => {
            handleRequests(get_clients_url, data, get_type, output.access_token)
                .then((output) => {
                    var clients = []
                    for (let i = 0; i < output.length; i++) {
                        clients.push([output[i].name, output[i].client_id]);
                    }

                    req.body.clients = clients;

                    next()
                })
                .catch((error) => {
                    console.log(error)
                    res.status(400)
                    res.send({ error: error })
                })
        })
        .catch((error) => {
            console.log(error)
            res.status(400)
            res.send({ error: error })
        })


})

router.post("/migrate_config", async (req, res, next) => {

    tenantSettings = req.body.tenant_settings

    var domain = tenantSettings.issuer.replace('https://', '');
    var domain_trailing_slash = domain.replace('/', '');


    var client_data = req.body.clients;

    var post_type = 'POST'
    var get_demos_url = 'https://data.mongodb-api.com/app/data-laqlc/endpoint/data/v1/action/findOne'
    var update_demo_url = 'https://data.mongodb-api.com/app/data-laqlc/endpoint/data/v1/action/updateOne'


    get_demo_deployment_data =
    {
        collection: "deployments",
        database: "platform",
        dataSource: "Cluster-Prod",
        filter: { "demoName": req.body.migrationDemoName }
    }

    handleMongoRequests(get_demos_url, get_demo_deployment_data, post_type)
        .then((output) => {

            if (output.document.demoConfiguration.templateId !== 'property0') {

                for (let i = 0; i < client_data.length; i++) {

                    for (let n = 0; n < output.document.applications.length; n++) {

                        if (output.document.applications[n].name === client_data[i][0]) {
                            output.document.applications[n].clientId = client_data[i][1]
                            output.document.applications[n].domain = domain_trailing_slash
                            output.document.resources[0].identifier = tenantSettings.issuer + 'api/v2'
                        }
                    }
                }

            }

            if (output.document.demoConfiguration.templateId === 'property0') {

                for (let i = 0; i < client_data.length; i++) {

                    for (let n = 0; n < output.document.applications.length; n++) {

                        if (output.document.applications[n].name === client_data[i][0]) {
                            output.document.applications[n].clientId = client_data[i][1]
                            output.document.applications[n].domain = domain_trailing_slash
                            output.document.resources[0].identifier = tenantSettings.issuer + 'api/v2'
                        }
                    }
                }
            }

            delete output.document._id
            output.document.demoOkta = "migration"

            req.body.tenant_configuration = output.document;

            update_demo_deployment_data =
            {
                collection: "deployments",
                database: "platform",
                dataSource: "Cluster-Prod",
                filter: { "demoName": req.body.migrationDemoName },
                upsert: "true",
                update: {
                    $set:
                        output.document
                }
            }

            req.body.migration_tenant_id = output.document.tenantId

            handleMongoRequests(update_demo_url, update_demo_deployment_data, post_type).then((output) => {

                update_demo_data =
                {
                    collection: "demos",
                    database: "demo0api",
                    dataSource: "Cluster-Prod",
                    filter: { "name": req.body.migrationDemoName },
                    upsert: "true",
                    update: {
                        $set:
                        {
                            "tenantId": req.body.migration_tenant_id,
                            "demoOkta": "migration"
                        }
                    }
                }

                handleMongoRequests(update_demo_url, update_demo_data, post_type).then((output) => {

                    var domain = tenantSettings.issuer.replace('https://', '');
                    var domain_trailing_slash = domain.replace('/', '');
                    var domain_host_only = domain_trailing_slash.replace('.cic-demo-platform.auth0app.com', '');

                    update_tenant_data =
                    {
                        collection: "tenants",
                        database: "platform",
                        dataSource: "Cluster-Prod",
                        filter: { "_id": { "$oid": req.body.migration_tenant_id } },
                        upsert: "true",
                        update: {
                            $set:
                            {
                                "dashboardLink": "https://manage.cic-demo-platform.auth0app.com/dashboard/pi/" + domain_host_only,
                                "domain": domain_trailing_slash,
                                "name": domain_host_only,
                                "demoOkta": "migration"
                            }
                        }
                    }

                    handleMongoRequests(update_demo_url, update_tenant_data, post_type).then((output) => {

                        var template = req.body.tenant_configuration.demoConfiguration.templateType

                        if (template === 'property0') {

                            get_property0_data = {
                                collection: "demos",
                                database: "property",
                                dataSource: "Cluster-Prod",
                                filter: { "name": req.body.migrationDemoName }
                            }

                            handleMongoRequests(get_demos_url, get_property0_data, post_type).then((output) => {

                                for (let i = 0; i < client_data.length; i++) {

                                    for (let n = 0; n < output.document.applications.length; n++) {
                
                                        if (output.document.applications[n].name === client_data[i][0]) {
                                            output.document.applications[n].clientId = client_data[i][1]
                                            output.document.applications[n].domain = domain_trailing_slash
                                            output.document.resources[0].identifier = tenantSettings.issuer + 'api/v2'
                                        }
                                    }
                                }

                                delete output.document._id
                                output.document.demoOkta = "migration"

                                update_property0_deployment_data =
                                {
                                    collection: "demos",
                                    database: "property",
                                    dataSource: "Cluster-Prod",
                                    filter: { "name": req.body.migrationDemoName },
                                    upsert: "true",
                                    update: {
                                        $set:
                                            output.document
                                    }
                                }

                                handleMongoRequests(update_demo_url, update_property0_deployment_data, post_type).then((output) => {

                                    res.status(200)
                                    res.send({ "Migrations": req.body.tenant_configuration.demoName + " migrated to the demo.okta tenant " + domain })

                                })
                                    .catch((error) => {
                                        console.log(error)
                                        res.status(400)
                                        res.send({ error: error })
                                    })

                            })
                                .catch((error) => {
                                    console.log(error)
                                    res.status(400)
                                    res.send({ error: error })
                                })

                        }

                        else {

                            res.status(200)
                            res.send({ "Migrations": req.body.tenant_configuration.demoName + " migrated to the demo.okta tenant " + domain })
                        }

                    })
                        .catch((error) => {
                            console.log(error)
                            res.status(400)
                            res.send({ error: error })
                        })

                })
                    .catch((error) => {
                        console.log(error)
                        res.status(400)
                        res.send({ error: error })
                    })

            })
                .catch((error) => {
                    console.log(error)
                    res.status(400)
                    res.send({ error: error })
                })
        })
        .catch((error) => {
            console.log(error)
            res.status(400)
            res.send({ error: error })
        })

})

module.exports = router;