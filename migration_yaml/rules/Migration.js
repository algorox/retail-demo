function verify(user, context, callback) {
  const request = require("request");

  user.app_metadata = user.app_metadata || {};
  if (context.stats.loginsCount === 1 && user.app_metadata.migrated) {
    request(
      {
        url: "https://legacy-demo-test.auth0.cloud/api/legacy/migrate",
        method: "POST",
        json: {
          email: user.email,
        },
        headers: {
          "content-type": "application/json",
          "x-api-key": "##LEGACY_AUTH_API_KEY##",
        },
      },
      (error) => {
        if (error) {
          callback(error);
        }
      }
    );
  }
  callback(null, user, context);
}
