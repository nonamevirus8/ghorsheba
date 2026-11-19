// Vercel serverless function: the tiny landing page the gateway
// return endpoint redirects to (Master Phase 8).
//
// It exists for one reason: the booking page is a hash-routed SPA, and
// a server redirect cannot carry the gateway's POST fields into it.
// This page moves the (base64url-encoded, already server-verified)
// callback fields into sessionStorage under the key the booking page's
// checkout panel looks for, then replaces itself with the booking
// page. The fields are re-verified server-side by the checkout panel
// before anything settles — this page proves nothing by itself.

import type { SslReq, SslRes } from "../_server/sslcommerz-http.js";

const PAGE = `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>পেমেন্ট যাচাই হচ্ছে — MistriDako</title>
</head>
<body style="font-family: system-ui, sans-serif; text-align: center; padding: 3rem 1rem;">
<p>পেমেন্ট যাচাই হচ্ছে… অনুগ্রহ করে অপেক্ষা করুন।</p>
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var code = params.get("code") || "";
  var d = params.get("d") || "";
  try {
    if (code && d) {
      var b64 = d.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
      var json = new TextDecoder().decode(bytes);
      sessionStorage.setItem("sslcommerz-return-" + code, json);
    }
  } catch (e) { /* the booking page re-reads the true state from the server */ }
  location.replace("/#/booking/" + encodeURIComponent(code));
})();
</script>
</body>
</html>`;

export default function handler(req: SslReq, res: SslRes): void {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  res.status(200).send(PAGE);
}
