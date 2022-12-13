const request = require('request')

const arrayOfHTTPErrors = [500, 501, 400, 401, 403, 404, 409, 412, 422, 429];

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

const handleMongoRequests = (url, body, type) => {

    return new Promise((resolve, reject) => {

        const options = {
            url: url,
            json: true,
            method: type,
            body: body,
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.MONGO_API_KEY
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

const handleJSONBinRequests = (url, body, type, demoName) => {

    return new Promise((resolve, reject) => {

        const options = {
            url: url,
            json: true,
            method: type,
            body: body,
            headers: {
                'Content-Type': 'application/json',
                'X-Master-key': process.env.JSON_BIN_KEY,
                'X-Bin-Name': demoName
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

module.exports = {
    handleRequests,
    handleMongoRequests,
    handleJSONBinRequests
}