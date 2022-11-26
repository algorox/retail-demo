const axios = require('axios')
const Tenant = require('./models/Tenant')
var passport = require('passport');
var { Strategy } = require('passport-openidconnect');
var logger = require('./logger')
var atob = require('atob');

const defaultTenantSub = "default"
const baseHost = new URL(process.env.BASE_URI).hostname

class TenantResolver {
    constructor() {
        this.tenants = new Map([]);
        this.tenants.set(defaultTenantSub,new Tenant(null,defaultTenantSub))
        this.configureTenantStrategy(this.tenants.get(defaultTenantSub),defaultTenantSub)
    }

    getTenant(string){
        var tenant = string.substr(0,string.indexOf("."+baseHost))
        if(tenant === ''){
            return 'default'
        }
        return tenant
    }

    getSettings(tenant){
        return this.tenants.get(tenant)
    }

    resolveTenant(){
        return async (req, res, next) => {
            let sub = this.getTenant(req.headers.host)
            if(sub == ""){
                logger.info("Using default sub.")
                sub = defaultTenantSub
            }

            logger.verbose("Request for subdomain '"+sub+"' received.")
            var tenant = this.tenants.get(sub)

            if(tenant == null || tenant.isExpired()){
                try{
                    logger.info("Consulting Demo API for tenant info of "+sub)
                    var response = await axios.get(process.env.DEMO_API_ENDPOINT+"/bootstrap/"+process.env.DEMO_API_APP_ID+"/"+sub,{
                        headers:{
                            Authorization: 'Bearer '+ await this.getServiceToken()
                        }
                    })
                    this.tenants.set(sub,new Tenant(response.data,sub));
                    logger.info("Tenant " + sub + " stored");
                    tenant = this.tenants.get(sub)
                    this.configureTenantStrategy(tenant,sub)
                }
                catch(error){
                    logger.warn(error)
                    if(error.response.status == 404){
                        req.session.errorMsg = "Unable to bootstrap demo "+sub
                    }
                    return res.redirect('/error');
                }
            }

            if(tenant == null){
                return res.redirect('/error');
            }
            req.session.settings = tenant.settings
            next()
        }
    }

    removeTenant(sub){
        try{
            this.tenants.delete(sub)
            passport.unuse(sub)
        }
        catch(err){
            console.log("Unable to remove tenant "+sub)
            console.error(err)
        }
    }

    async getServiceToken(){
        if(!this.demoApiToken || this.isExpired(this.demoApiToken)){
            try{
                var resp = await axios({
                    method: 'post',
                    url: process.env.DEMO_API_TOKEN_ENDPOINT,
                    headers: { 
                        'Accept': 'application/json', 
                        'Content-Type': 'application/json', 
                    },
                    data: {
                        "grant_type": "client_credentials",
                        "client_id": process.env.DEMO_API_CLIENT_ID,
                        "client_secret": process.env.DEMO_API_CLIENT_SECRET,
                        "scope": "bootstrap",
                        "audience": process.env.DEMO_API_AUDIENCE,
                    }
                })
                this.demoApiToken = resp.data.access_token;
            } catch(err){
                logger.error("Unable to retrieve service token.")
                logger.error(err)
            }
        }
        return this.demoApiToken
    }

    isExpired(token){
        try{
            if (token != null) {
                var base64Url = token.split('.')[1];
                var base64 = base64Url.replace('-', '+').replace('_', '/');

                var payload = JSON.stringify(JSON.parse(atob(base64)), undefined, '\t');
                if(!payload.exp || payload.exp <= Date.now()){
                    return true
                }
                else{
                    return false
                }
            }
        } catch (err){
            logger.error(err)
        }
        return true
    }

    configureTenantStrategy(tenant,sub){
        passport.use(sub, new Strategy({
            issuer: tenant.issuer,
            authorizationURL: tenant.authorizationURL,
            tokenURL: tenant.tokenURL,
            userInfoURL: tenant.userInfoURL,
            clientID: tenant.clientID,
            clientSecret: tenant.clientSecret,
            callbackURL: tenant.callbackURL,
            scope: process.env.SCOPES
          }, (iss, profile, context, idToken, accessToken, refreshToken, params, verified) => {
            var user = {
                'profile': profile._json,
                'tokens': {
                    'id_token': idToken,
                    'access_token': accessToken,
                    'refresh_token': refreshToken
                } 
            }
            return verified(null, user);
          }));
    }
}

module.exports = TenantResolver
