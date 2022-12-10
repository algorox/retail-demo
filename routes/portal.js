require('dotenv').config()
const express = require('express')
const router = express.Router();
const tenantResolver = require('../tenantResolver')
var logger = require('../logger');

const tr = new tenantResolver();

router.get("/", async (req, res, next) => {

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

router.post("/create_legacy_demo", async (req, res, next) => {

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
                                "demo_creation": output
                            });

                        }).catch((err) => {
                            console.log(err);
                            res.status(err.error)
                            res.send({
                                "demo_creation": err
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
                                                "demo_creation": output
                                            });

                                        }).catch((err) => {
                                            console.log(err);
                                            res.status(err.error)
                                            res.send({
                                                "demo_creation": err
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
                "demo_creation": err
            });
        })

})

router.post("/get_legacy_demo", async (req, res, next) => {

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
                                "raw": demo_response,
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

router.post("/get_legacy_tenants", async (req, res, next) => {

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

router.post("/get_legacy_tenants", async (req, res, next) => {

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

router.post("/get_legacy_logs", async (req, res, next) => {

    var url, data, type, accessToken;

    var demo_name = req.body.demo_name || 'empty'

    url = 'https://portal.auth0.cloud/api/logs/' + demo_name
    type = 'GET'
    accessToken = req.userContext.at

    handleRequests(url, data, type, accessToken)
        .then((output) => {

            res.status(200)
            res.send({
                "Logs": output
            });

        })
        .catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send({
                "Logs": err
            });
        });

})

router.post("/get_legacy_db_users", async (req, res, next) => {

    var url, data, type, accessToken;

    var demo_name = req.body.demo_name || 'empty'

    url = 'https://portal.auth0.cloud/api/legacy/users/' + demo_name
    type = 'GET'
    accessToken = req.userContext.at

    handleRequests(url, data, type, accessToken)
        .then((output) => {

            res.status(200)
            res.send({
                "Legacy_Users": output
            });

        })
        .catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send({
                "Legacy_Users": err
            });
        });

})

router.post("/mailtrap", async (req, res, next) => {

    var url, data, type, accessToken;

    var key = req.body.key || 'empty'

    url = 'https://portal.auth0.cloud/api/settings'
    type = 'PATCH'
    accessToken = req.userContext.at

    data = {
        "mailtrap_api_key": req.body.key 
    }

    handleRequests(url, data, type, accessToken)
        .then((output) => {

            res.status(200)
            res.send({
                "Mailtrap": output
            });

        })
        .catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send({
                "Mailtrap": err
            });
        });

})

router.post("/update_demo_flags", async (req, res, next) => {

    var url, data, type, accessToken;

    url = 'https://portal.auth0.cloud/api/demos/' + req.body.demo_id
    type = 'PATCH'
    accessToken = req.userContext.at

    if (req.body.flag_cic_value != null)
    {
        data = {
            "flags":[{
                "name": "USE_AUTH0_UNIVERSAL_LOGIN",
                "enabled": req.body.flag_cic_value
            }]
        }
    
    }

    if (req.body.flag_azure_ad_value != null)
    {
        data = {
            "flags":[{
                "name": "USE_AZURE_AD_CONNECTION",
                "enabled": req.body.flag_azure_ad_value
            }]
        }
    
    }

    handleRequests(url, data, type, accessToken)
        .then((output) => {

            res.status(200)
            res.send({
                "Flag": output
            });

        })
        .catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send({
                "Flag": err
            });
        });

})

module.exports = router;