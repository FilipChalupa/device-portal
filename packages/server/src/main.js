"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_server_1 = require("@hono/node-server");
const node_ws_1 = require("@hono/node-ws");
const hono_1 = require("hono");
const app = new hono_1.Hono();
const { injectWebSocket, upgradeWebSocket } = (0, node_ws_1.createNodeWebSocket)({ app });
const rooms = new Map();
app.get('/', upgradeWebSocket((c) => {
    let room = null;
    return {
        onMessage(evt, ws) {
            const message = JSON.parse(evt.data);
            switch (message.type) {
                case 'join-room': {
                    room = message.room;
                    if (!rooms.has(room)) {
                        rooms.set(room, new Set());
                    }
                    rooms.get(room).add(ws);
                    console.log(`Peer joined room: ${room}`);
                    break;
                }
                case 'offer':
                case 'answer':
                case 'ice-candidate': {
                    if (room && rooms.has(room)) {
                        for (const client of rooms.get(room)) {
                            if (client !== ws && client.readyState === 1 /* WebSocket.OPEN */) {
                                client.send(JSON.stringify({ type: message.type, data: message.data }));
                            }
                        }
                    }
                    break;
                }
            }
        },
        onClose(evt, ws) {
            if (room && rooms.has(room)) {
                rooms.get(room).delete(ws);
                if (rooms.get(room).size === 0) {
                    rooms.delete(room);
                }
            }
            console.log('WebSocket connection closed.');
        },
        onError(evt, ws) {
            console.error('WebSocket error:', evt);
        },
        onOpen(evt, ws) {
            console.log('WebSocket connection opened.');
        }
    };
}));
const portString = process.env.PORT;
let port = 8080;
if (portString) {
    const parsedPort = parseInt(portString, 10);
    if (!isNaN(parsedPort)) {
        port = parsedPort;
    }
}
console.log(`Starting WebSocket signaling server on port ${port}...`);
const server = (0, node_server_1.serve)({
    fetch: app.fetch,
    port,
});
injectWebSocket(server);
