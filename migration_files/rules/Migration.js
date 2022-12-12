function verify(user, context, callback) {
  user.app_metadata = user.app_metadata || {};
  if (context.stats.loginsCount === 1 && user.app_metadata.migrated) {
    request(
      {
        url: "https://playstation.auth0.cloud/api/legacy/migrate",
        method: "POST",
        json: {
          email: user.email,
        },
        headers: {
          "content-type": "application/json",
          "x-api-key": "b1959ffa06d8b7d97570a72dff4720b18cd5baa34b7d126e",
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
