function login(email, password, callback) {
  const request = require("request");

  function isEmail(data) {
    const re =
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(data).toLowerCase());
  }

  const payload = {
    password,
    ...(isEmail(email) && { email }),
    ...(!isEmail(email) && { username: email }),
  };

  request(
    {
      url: "https://legacy-demo-test.auth0.cloud/api/legacy/auth",
      method: "POST",
      json: payload,
      headers: {
        "content-type": "application/json",
        "x-api-key": "2262dcb183afb9c6516f7dea4b7a95b1f773bc078d991c13",
      },
    },
    function (err, response, body) {
      if (err) return callback(err);
      if (response.statusCode === 401) return callback();

      callback(null, {
        id: body.data.id,
        email: body.data.email,
        username: body.data.username,
        given_name: body.data.firstName,
        family_name: body.data.lastName,
        app_metadata: {
          migrated: true,
        },
      });
    }
  );
}
