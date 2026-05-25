// One-shot diagnostic: hit Ubisoft's login endpoint directly and dump the raw
// response so we can tell apart a WAF/captcha block (HTML body, cf-* headers)
// from a credential/2FA rejection (JSON error body).
const email = process.env.UBI_EMAIL;
const password = process.env.UBI_PASSWORD;
if (!email || !password) {
  console.error("Missing UBI_EMAIL / UBI_PASSWORD in .env");
  process.exit(1);
}

const APP_ID = "3587dcbb-7f81-457c-9781-0e3f29f6f56a";
const LOGIN = "https://public-ubiservices.ubi.com/v3/profiles/sessions";
const basic = "Basic " + Buffer.from(`${email}:${password}`, "utf8").toString("base64");

const headers = {
  "Content-Type": "application/json; charset=UTF-8",
  "Ubi-AppId": APP_ID,
  "Ubi-RequestedPlatformType": "uplay",
  Authorization: basic,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
};

console.log(`POST ${LOGIN}  (UA: browser-like)`);
const res = await fetch(LOGIN, {
  method: "POST",
  headers,
  body: JSON.stringify({ rememberMe: true }),
});

console.log(`\nstatus: ${res.status} ${res.statusText}`);
console.log("response headers:");
for (const [k, v] of res.headers) console.log(`  ${k}: ${v}`);

const body = await res.text();
console.log(`\nbody (first 2000 chars):\n${body.slice(0, 2000)}`);
