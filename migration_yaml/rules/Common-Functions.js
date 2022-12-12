function common(user, context, callback) {
  const request = require("request");

  if (!global.createAuditLog) {
    global.createAuditLog = function (category, data, error) {
      return new Promise((resolve, reject) => {
        const options = {
          url: "https://legacy-demo-test.auth0.cloud/api/v1/logs",
          method: "POST",
          json: {
            demoName: "legacy-demo-test",
            category,
            type: error ? "FAILURE" : "SUCCESS",
            data: error ? { error } : data,
            deleted: false,
          },
        };

        request(options, (err, response, body) => {
          if (err) {
            reject(err);
          } else if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(body));
          } else {
            resolve(response.body);
          }
        });
      });
    };
  }
  callback(null, user, context);
}
