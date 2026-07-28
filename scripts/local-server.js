const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".png":"image/png", ".json":"application/json" };
http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname.startsWith("/api/")) { response.writeHead(503,{"Content-Type":"application/json"}); return response.end('{"error":"LOCAL_OFFLINE_PREVIEW"}'); }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/,"");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end("Niet gevonden"); }
  response.writeHead(200,{"Content-Type":types[path.extname(file)] || "application/octet-stream","Cache-Control":"no-store"});
  fs.createReadStream(file).pipe(response);
}).listen(4173,"127.0.0.1",()=>console.log("http://127.0.0.1:4173"));
