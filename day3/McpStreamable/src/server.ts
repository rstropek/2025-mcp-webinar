import { createServer } from "http";

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Testpage</title>
  <style>
    body { font-family: Arial, sans-serif; }
    ul li:first-child span { color: white; }
  </style>
</head>
<body>
  <h1>Hello</h1>
  <ul>
    <li>C# is <span>awesome</span></li>
    <li>TypeScript is <span>great</span></li>
    <li>JavaScript is <span>fun</span></li>
    <li>Python is <span>cool</span></li>
  </ul>
</body>
</html>
`;

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
