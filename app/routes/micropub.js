/**
 * @module routes/micropub
 */
const config = require(process.env.PWD + '/app/config');
const cache = require(process.env.PWD + '/app/lib/cache');
const indieauth = require(process.env.PWD + '/app/lib/indieauth');
const microformats = require(process.env.PWD + '/app/lib/microformats');
const micropub = require(process.env.PWD + '/app/lib/micropub');

/**
 * Responds to GET requests
 *
 * @param {Object} request Request
 * @param {Object} response Response
 * @return {Object} HTTP response
 */
exports.get = async (request, response) => {
  const publication = await require(process.env.PWD + '/app/lib/publication')();
  const appUrl = `${request.protocol}://${request.headers.host}`;
  const getResponse = await micropub.query(request.query, publication, appUrl);

  return response.status(getResponse.code).json(getResponse.body);
};

/**
 * Responds to POST requests
 *
 * @param {Object} request Request
 * @param {Object} response Response
 * @param {Object} next Callback
 * @return {Object} HTTP response
 */
exports.post = async (request, response, next) => {
  const publication = await require(process.env.PWD + '/app/lib/publication')();
  const getPostResponse = async request => {
    let {body} = request;
    const {files} = request;

    // Ensure token is provided
    const accessToken = request.headers.authorization || body.access_token;
    if (!accessToken) {
      return micropub.response.error('unauthorized');
    }

    // Verify token
    const verifiedToken = await indieauth.verifyToken(accessToken, config.url);
    if (!verifiedToken) {
      return micropub.response.error('forbidden', 'Unable to verify access token');
    }

    // Authorized users can purge cache
    if (request.query.purge === 'cache') {
      cache.delete();
      return micropub.response.success();
    }

    // Ensure response has body data
    const hasBody = Object.entries(body).length !== 0;
    if (!hasBody) {
      return micropub.response.error('invalid_request');
    }

    // Normalise form-encoded requests as mf2 JSON
    if (!request.is('json')) {
      body = microformats.formEncodedToMf2(body);
    }

    // Determine action, ensuring token includes scope permission
    const {scope} = verifiedToken;
    const {action} = body;
    const {url} = body;

    // Delete action (WIP)
    if (action === 'delete') {
      if (scope.includes('delete')) {
        return micropub.deletePost(url);
      }

      return micropub.response.error('insufficient_scope');
    }

    // Update action (not yet supported)
    if (action === 'update') {
      if (scope.includes('update')) {
        return micropub.response.error('invalid_request', 'Update action not supported');
      }

      return micropub.response.error('insufficient_scope');
    }

    // Create action
    if (scope.includes('create')) {
      return micropub.createPost(publication, body, files);
    }

    return micropub.response.error('insufficient_scope');
  };

  try {
    const postResponse = await getPostResponse(request);
    return response.status(postResponse.code).set({
      location: postResponse.location
    }).json(postResponse.body);
  } catch (error) {
    console.error(error);
  }

  next();
};
