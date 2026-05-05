import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { logger } from "../lib/logger.js";

let io: SocketServer | null = null;

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/api/socket.io",
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Client connected");

    socket.on("JOIN_REQUEST", (requestId: string) => {
      socket.join(`request:${requestId}`);
    });

    socket.on("LEAVE_REQUEST", (requestId: string) => {
      socket.leave(`request:${requestId}`);
    });

    socket.on("NEGOTIATE", (data: { requestId: string; message: string }) => {
      io?.to(`request:${data.requestId}`).emit("NEGOTIATION_MESSAGE", data);
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Client disconnected");
    });
  });

  return io;
}

export function getIo(): SocketServer | null {
  return io;
}
