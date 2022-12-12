function getUser(email, callback) {
  function isEmail(data) {
    const re =
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(data).toLowerCase());
  }

  // determine if authentication is taking place with email or username
  const search = isEmail(email) ? `email=${email}` : `username=${email}`;

  request(
    {
      url: `https://legacy-demo-test.auth0.cloud/api/legacy/users?${search}`,
      method: "GET",
      json: true,
      headers: {
        "x-api-key": "##LEGACY_AUTH_API_KEY##",
      },
    },
    (error, response, body) => {
      if (error) {
        callback(error);
      } else if (!body.data.email) {
        // user not found
        callback(null, null);
      } else {
        const { data: profile } = body;

        const user = {
          id: profile.id,
          email: profile.email,
          username: profile.username,
          given_name: profile.firstName,
          family_name: profile.lastName,
          app_metadata: {
            migrated: true,
          },
        };
        callback(null, user);
      }
    }
  );
}