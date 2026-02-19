// server/main.ts
const portString = Deno.env.get("PORT");
let port = 8080;
if (portString) {
  const parsedPort = parseInt(portString, 10);
  if (!isNaN(parsedPort)) {
    port = parsedPort;
  }
}

console.log(`Starting WebSocket signaling server on port ${port}...`);

const rooms = new Map<string, WebSocket[]>();

Deno.serve({ port }, (req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response(null, { status: 501 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    console.log("WebSocket connection opened.");
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case "join-room": {
        const { room } = message;
        if (!rooms.has(room)) {
          rooms.set(room, []);
        }
        rooms.get(room)!.push(socket);
        console.log(`Peer joined room: ${room}`);
        break;
      }
      case "offer":
      case "answer":
      case "ice-candidate": {
        const { room, data } = message;
        if (rooms.has(room)) {
          for (const client of rooms.get(room)!) {
            if (client !== socket && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: message.type, data }));
            }
          }
        }
        break;
      }
    }
  };

  socket.onclose = () => {
    console.log("WebSocket connection closed.");
    for (const [room, clients] of rooms.entries()) {
      const index = clients.indexOf(socket);
      if (index !== -1) {
        clients.splice(index, 1);
        if (clients.length === 0) {
          rooms.delete(room);
        }
        break;
      }
    }
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  return response;
});
