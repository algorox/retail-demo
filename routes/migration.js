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
const handleJSONBinRequests = require('../utils/requests').handleJSONBinRequests;
const handleAzureRequests = require('../utils/requests').handleAzureRequests;
const qs = require('qs')

const tr = new tenantResolver();

//check if demo exists
router.post("/migrate_config", async (req, res, next) => {

    var check_url = 'https://portal.auth0.cloud/api/demos/' + req.body.migrationDemoName + '/is-valid';
    var check_data;
    var get_type = 'GET'
    var accessToken = req.userContext.at

    handleRequests(check_url, check_data, get_type, accessToken)
        .then((output) => {
            console.log('no demo found')
            res.status(400)
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

///backup the mongo db configs in JSONBin.io
router.post("/migrate_config", tr.resolveTenant(), async (req, res, next) => {

    raw_mongo_output = {}

    var post_type = 'POST'
    var get_demos_url = 'https://data.mongodb-api.com/app/' + process.env.MONGO_URL_PATH + '/endpoint/data/v1/action/findOne'
    var jsonBin_url = 'https://api.jsonbin.io/v3/b'

    var tenantSettings = tr.getSettings(tr.getTenant(req.headers.host))
    var domain = tenantSettings.issuer.replace('https://', '');
    var domain_trailing_slash = domain.replace('/', '');

    req.body.tenant_settings = tenantSettings

    get_tenant_data =
    {
        collection: "tenants",
        database: "platform",
        dataSource: "Cluster-Prod",
        filter: { "demoName": req.body.migrationDemoName }
    }

    get_deployment_data =
    {
        collection: "deployments",
        database: "platform",
        dataSource: "Cluster-Prod",
        filter: { "demoName": req.body.migrationDemoName }
    }

    get_demo_data =
    {
        collection: "demos",
        database: "demo0api",
        dataSource: "Cluster-Prod",
        filter: { "name": req.body.migrationDemoName }
    }

    get_property0_data =
    {
        collection: "demos",
        database: "property",
        dataSource: "Cluster-Prod",
        filter: { "name": req.body.migrationDemoName }
    }

    raw_mongo_output = {}

    handleMongoRequests(get_demos_url, get_tenant_data, post_type).then((output) => {

        raw_mongo_output.tenant = output.document

        handleMongoRequests(get_demos_url, get_deployment_data, post_type).then((output) => {

            raw_mongo_output.deployment = output.document

            handleMongoRequests(get_demos_url, get_demo_data, post_type).then((output) => {

                raw_mongo_output.demo = output.document

                handleMongoRequests(get_demos_url, get_property0_data, post_type).then((output) => {

                    raw_mongo_output.property0 = output.document

                    if (((raw_mongo_output.tenant.hasOwnProperty('demoOkta')) ||
                        ((raw_mongo_output.deployment.hasOwnProperty('demoOkta')) && ((raw_mongo_output.tenant.hasOwnProperty('demoOkta')))))
                        && req.body.download != "true") {
                        //if (output.document.hasOwnProperty('test') && req.body.download != "true") {
                        res.status(400)
                        res.send({ "Note": "You have already migrated this demo to demo.okta. It's attached to " + raw_mongo_output.tenant.dashboardLink })
                    }

                    else {
                        handleJSONBinRequests(jsonBin_url, raw_mongo_output, post_type, req.body.migrationDemoName).then((output) => {
                            next()
                        })
                            .catch((error) => {
                                console.log(error)
                                res.status(400)
                                res.send({ error: error })
                            })
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

    }).catch((error) => {
        console.log(error)
        res.status(400)
        res.send({ error: error })
    })

})

// ///export the tenant config from the tenant
router.post("/migrate_config", async (req, res, next) => {

    var post_type = 'POST'
    var get_demos_url = 'https://data.mongodb-api.com/app/' + process.env.MONGO_URL_PATH + '/endpoint/data/v1/action/findOne'

    get_demo_tenant_data =
    {
        collection: "tenants",
        database: "platform",
        dataSource: "Cluster-Prod",
        filter: { "demoName": req.body.migrationDemoName }
    }

    handleMongoRequests(get_demos_url, get_demo_tenant_data, post_type).then((output) => {

        const tenantsJsonPath = './migration_files/tenant.json'

        fs.access(tenantsJsonPath, fs.F_OK, (err) => {
            if (err) {

                var from_config;
                from_config = {
                    AUTH0_DOMAIN: output.document.domain,
                    AUTH0_CLIENT_SECRET: output.document.clientSecret,
                    AUTH0_CLIENT_ID: output.document.clientId,
                    // AUTH0_DOMAIN: process.env.MIGRATION_DOMAIN,
                    // AUTH0_CLIENT_SECRET: process.env.MIGRATION_SECRET,
                    // AUTH0_CLIENT_ID: process.env.MIGRATION_CLIENT,
                    AUTH0_ALLOW_DELETE: false,
                    INCLUDED_PROPS: {
                        "clients": ["client_secret", "client_id"]
                    },
                }

                //fs.mkdtemp(path.join(os.tmpdir(), 'tenant-config-'), (err, folder) => {
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

            }

            else {
                next()
            }

        })

        //https://github.com/auth0/auth0-deploy-cli/blob/master/docs/excluding-from-management.md

    })
        .catch((error) => {
            console.log(error)
            res.status(400)
            res.send({ error: error })
        })

})

///import the tenant config to the tenant
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
        },
        // AUTH0_KEYWORD_REPLACE_MAPPINGS: {
        //     CLEARBIT_API_KEY: process.env.CLEARBIT_API_KEY,
        //     AZURE_AD_DOMAIN: process.env.AZURE_DIRECTORY_DOMAIN,
        //     AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
        //     AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET
        // }
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

// get the client info from the destination tenant so that they can be added to the database
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
                        clients.push([output[i].client_secret, output[i].client_id]);
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

///update the mongo db with the new tenant and demo info
router.post("/migrate_config", async (req, res, next) => {

    tenantSettings = req.body.tenant_settings

    var domain = tenantSettings.issuer.replace('https://', '');
    var domain_trailing_slash = domain.replace('/', '');


    var client_data = req.body.clients;

    var post_type = 'POST'
    var update_demo_url = 'https://data.mongodb-api.com/app/' + process.env.MONGO_URL_PATH + '/endpoint/data/v1/action/updateOne'


    if (raw_mongo_output.deployment.demoConfiguration.templateId !== 'property0') {

        for (let i = 0; i < client_data.length; i++) {

            for (let n = 0; n < raw_mongo_output.deployment.applications.length; n++) {

                if (raw_mongo_output.deployment.applications[n].clientSecret === client_data[i][0]) {
                    raw_mongo_output.deployment.applications[n].clientId = client_data[i][1]
                    raw_mongo_output.deployment.applications[n].domain = domain_trailing_slash
                    raw_mongo_output.deployment.resources[0].identifier = tenantSettings.issuer + 'api/v2'
                }
            }
        }

    }

    if (raw_mongo_output.deployment.demoConfiguration.templateId === 'property0') {

        for (let i = 0; i < client_data.length; i++) {

            for (let n = 0; n < raw_mongo_output.deployment.applications.length; n++) {

                if (raw_mongo_output.deployment.applications[n].clientSecret === client_data[i][0]) {
                    raw_mongo_output.deployment.applications[n].clientId = client_data[i][1]
                    raw_mongo_output.deployment.applications[n].domain = domain_trailing_slash
                    raw_mongo_output.deployment.resources[0].identifier = tenantSettings.issuer + 'api/v2'
                }
            }
        }
    }

    delete raw_mongo_output.deployment._id
    raw_mongo_output.deployment.demoOkta = "migration"

    update_demo_deployment_data =
    {
        collection: "deployments",
        database: "platform",
        dataSource: "Cluster-Prod",
        filter: { "demoName": req.body.migrationDemoName },
        upsert: "true",
        update: {
            $set:
                raw_mongo_output.deployment
        }
    }

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
                    "tenantId": raw_mongo_output.deployment.tenantId,
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

                var template = raw_mongo_output.deployment.demoConfiguration.templateType

                if (template === 'property0') {

                    for (let i = 0; i < client_data.length; i++) {

                        for (let n = 0; n < raw_mongo_output.property0.applications.length; n++) {

                            if (raw_mongo_output.property0.applications[n].clientSecret === client_data[i][0]) {
                                raw_mongo_output.property0.applications[n].clientId = client_data[i][1]
                                raw_mongo_output.property0.applications[n].domain = domain_trailing_slash
                                raw_mongo_output.property0.resources[0].identifier = tenantSettings.issuer + 'api/v2'
                            }
                        }
                    }

                    delete raw_mongo_output.property0.document._id
                    raw_mongo_output.property0.demoOkta = "migration"

                    update_property0_deployment_data =
                    {
                        collection: "demos",
                        database: "property",
                        dataSource: "Cluster-Prod",
                        filter: { "name": req.body.migrationDemoName },
                        upsert: "true",
                        update: {
                            $set:
                                raw_mongo_output.property0
                        }
                    }

                    handleMongoRequests(update_demo_url, update_property0_deployment_data, post_type).then((output) => {
                        next()

                    })
                        .catch((error) => {
                            console.log(error)
                            res.status(400)
                            res.send({ error: error })
                        })

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

///update Azure AD with callback URI
router.post("/migrate_config", async (req, res, next) => {

    var post_type = 'POST'
    var patch_type = 'PATCH'
    var get_azure_token_url = 'https://login.microsoftonline.com/' + process.env.AZURE_TENANT + '/oauth2/token'
    var get_azure_token_data = {
        grant_type: 'client_credentials',
        client_id: process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        resource: 'https://graph.microsoft.com'
    }
    var tenantSettings = req.body.tenant_settings

    form_data = qs.stringify(get_azure_token_data)

    handleAzureRequests(get_azure_token_url, form_data, post_type).then((output) => {


        var update_client_url = 'https://graph.microsoft.com/v1.0/applications/' + raw_mongo_output.deployment.azureClient.appId
        var update_client_data = {
            web: { redirectUris: [tenantSettings.issuer + "login/callback"] }
        }

        handleRequests(update_client_url, update_client_data, patch_type, output.access_token).then((output) => {

            var domain = tenantSettings.issuer.replace('https://', '');

            res.status(200)
            res.send({ "Migrations": raw_mongo_output.deployment.demoName + " migrated to the demo.okta tenant " + domain })

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