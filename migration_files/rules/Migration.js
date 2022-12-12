function verify(user, context, callback) {
  const request = require("request");

  user.app_metadata = user.app_metadata || {};
  if (context.stats.loginsCount === 1 && user.app_metadata.migrated) {
    request(
      {
        url: "https://test-for-preview-12121.auth0.cloud/api/legacy/migrate",
        method: "POST",
        json: {
          email: user.email,
        },
        headers: {
          "content-type": "application/json",
          "x-api-key": "508f0f3dc8b1325e58d7a31c23d8db32b51a4b24e17c0a7f",
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
