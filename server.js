const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.get("/", (_req, res) => res.send("HT Internet signaling server is running."));
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});
const roomMembers = new Map();

io.on("connection", socket => {
  socket.on("join-room", payload => {
    const room = String(payload?.room || "").trim().toUpperCase().slice(0, 40);
    if (!room) return;
    const members = roomMembers.get(room) || [];
    if (members.length >= 2) {
      socket.emit("room-full");
      return;
    }
    socket.data.room = room;
    socket.join(room);
    if (members.length === 1) {
      const other = members[0];
      roomMembers.set(room, [...members, socket.id]);
      io.to(socket.id).emit("joined", { peerPresent: true, peerId: other });
      io.to(other).emit("peer-joined", { peerId: socket.id });
    } else {
      roomMembers.set(room, [socket.id]);
      socket.emit("joined", { peerPresent: false });
    }
  });

  socket.on("signal", payload => {
    const target = payload?.target;
    if (!target || !socket.data.room) return;
    // Only relay to the other participant in this socket's room.
    const members = roomMembers.get(socket.data.room) || [];
    if (members.includes(target) && target !== socket.id) {
      const { target: _target, ...message } = payload;
      io.to(target).emit("signal", { ...message, from: socket.id });
    }
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (!room) return;
    const members = (roomMembers.get(room) || []).filter(id => id !== socket.id);
    if (members.length) {
      roomMembers.set(room, members);
      members.forEach(id => io.to(id).emit("peer-left"));
    } else {
      roomMembers.delete(room);
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => console.log(`HT signaling server listening on ${port}`));
