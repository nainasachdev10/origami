/**
 * X API v2 publisher using OAuth 1.0a
 *
 * Required env vars:
 *   X_API_KEY              — API key (consumer key)
 *   X_API_SECRET           — API secret (consumer secret)
 *   X_ACCESS_TOKEN         — OAuth access token
 *   X_ACCESS_TOKEN_SECRET  — OAuth access token secret
 *
 * No external dependencies — uses Node's built-in `crypto` module.
 */

import crypto from "crypto";

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export interface PostTweetResult {
  id: string;
  text: string;
}

export interface PostThreadResult {
  tweets: PostTweetResult[];
  firstTweetId: string;
}

// ---------------------------------------------------------------------------
// OAuth 1.0a helpers
// ---------------------------------------------------------------------------

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function generateNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

/**
 * Build the OAuth 1.0a Authorization header for a request.
 *
 * @param method   HTTP method (uppercase)
 * @param url      Full request URL (no query string)
 * @param params   Any additional parameters to include in the signature base
 *                 string (typically the JSON body fields for POST requests —
 *                 omit for JSON bodies since they are not form-encoded params).
 * @param credentials  XCredentials object
 * @returns        Value for the Authorization header
 */
export function signRequest(
  method: string,
  url: string,
  params: Record<string, string>,
  credentials: XCredentials
): string {
  const nonce = generateNonce();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  // Collect all parameters (OAuth + any additional params)
  const allParams: Record<string, string> = { ...params, ...oauthParams };

  // Percent-encode keys and values, sort alphabetically, join as key=value&...
  const paramString = Object.keys(allParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
    .join("&");

  // Signature base string: METHOD&percent_encoded_url&percent_encoded_params
  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  // Signing key: percent_encoded_consumer_secret&percent_encoded_token_secret
  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(
    credentials.accessTokenSecret
  )}`;

  // HMAC-SHA1 signature
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  // Build Authorization header value
  const authParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const headerValue =
    "OAuth " +
    Object.keys(authParams)
      .sort()
      .map((key) => `${key}="${percentEncode(authParams[key])}"`)
      .join(", ");

  return headerValue;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

const X_TWEETS_URL = "https://api.twitter.com/2/tweets";

interface XApiError {
  detail?: string;
  title?: string;
  errors?: Array<{ message: string }>;
}

async function callXApi(
  credentials: XCredentials,
  body: Record<string, unknown>
): Promise<PostTweetResult> {
  const authHeader = signRequest("POST", X_TWEETS_URL, {}, credentials);

  const response = await fetch(X_TWEETS_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as {
    data?: { id: string; text: string };
    errors?: Array<{ message: string }>;
    detail?: string;
    title?: string;
  };

  if (!response.ok) {
    const err = data as XApiError;
    const message =
      err.errors?.[0]?.message ??
      err.detail ??
      err.title ??
      `X API error ${response.status}`;
    throw new Error(message);
  }

  if (!data.data) {
    throw new Error("X API returned an unexpected response (no data field)");
  }

  return { id: data.data.id, text: data.data.text };
}

/**
 * Post a single tweet via X API v2.
 */
export async function postTweet(
  credentials: XCredentials,
  text: string
): Promise<PostTweetResult> {
  return callXApi(credentials, { text });
}

/**
 * Post a thread of tweets via X API v2.
 *
 * Each tweet is posted sequentially as a reply to the previous one so that
 * Twitter links them into a thread. Returns all tweet ids and the id of the
 * first tweet.
 */
export async function postThread(
  credentials: XCredentials,
  tweets: string[]
): Promise<PostThreadResult> {
  if (tweets.length === 0) {
    throw new Error("postThread: tweets array must not be empty");
  }

  const results: PostTweetResult[] = [];
  let previousId: string | null = null;

  for (const text of tweets) {
    const body: Record<string, unknown> = { text };

    if (previousId !== null) {
      body.reply = { in_reply_to_tweet_id: previousId };
    }

    const result = await callXApi(credentials, body);
    results.push(result);
    previousId = result.id;
  }

  return {
    tweets: results,
    firstTweetId: results[0].id,
  };
}
