require('dotenv').config()
const express = require('express')
const router = express.Router();
const tenantResolver = require('../tenantResolver')
var logger = require('../logger');
const handleRequests = require('../utils/requests').handleRequests;
const handleMongoRequests = require('../utils/requests').handleMongoRequests;

const tr = new tenantResolver();

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

router.post("/delete_legacy_tenants", async (req, res, next) => {

    var url, data, type, accessToken;
    var post_type = 'POST'
    var get_demos_url = 'https://data.mongodb-api.com/app/data-laqlc/endpoint/data/v1/action/findOne'

    tenantSettings = req.body.tenant_settings

    var domain = tenantSettings.issuer.replace('https://', '');
    var domain_trailing_slash = domain.replace('/', '');

    get_demo_deployment_data =
    {
        collection: "tenants",
        database: "platform",
        dataSource: "Cluster-Prod",
        filter: { "domain": domain_trailing_slash }
    }

    url = 'https://portal.auth0.cloud/api/demos'
    type = 'GET'
    clear_type = 'DELETE'
    accessToken = req.userContext.at
    var clear_demo_url, clear_tenant_url;


    handleMongoRequests(get_demos_url, get_demo_deployment_data, post_type).then((output) => {

        if (output.document.hasOwnProperty('demoOkta')) {

            if (output.document.demoOkta === "migration") {
                res.status(200)
                res.send({
                    "demoOkta": "migration",
                    "Clear": "The associated demo.okta CIC tenant (" + domain_trailing_slash + ") has already been used to migrate a Travel0 or Property0 demo. To reduce conflicts / issues, please spin up a new demo in another tenant"
                })
            }

        }
        else {

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
                                    "Clear": "Cleared"
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
                            "Clear": "Demo Not Found"
                        });
                    }

                })
                .catch((err) => {
                    console.log(err);
                    res.status(err.error)
                    res.send({
                        "Clear": err
                    });
                });

        }
    })
        .catch((err) => {
            console.log(err);
            res.status(err.error)
            res.send({
                "Clear": err
            });
        });
})

module.exports = router;