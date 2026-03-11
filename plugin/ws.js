// test-ws-server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
wss.on('connection', ws => {
  console.log('client connected');
  ws.on('message', msg => {
    console.log('recv:', msg);
    ws.send('echo:' + msg);
  });
});
console.log('ws server listening on 8080');