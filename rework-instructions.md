# Rework Instructions for react-device-portal

This document outlines the instructions for a complete rework of the `react-device-portal` project. The main goal of the rework is to replace the current HTTP-based signaling mechanism with a WebSocket-based one and to include the signaling server in this repository.

## 1. Project Overview

`react-device-portal` is a library that provides a simple way to create WebRTC data channels in React applications. It consists of React hooks and components that allow communication between different devices or browser tabs.

The current implementation uses an external HTTP-based signaling server (`webrtc-signaling.deno.dev`) to exchange WebRTC signaling messages. This rework will replace that with a WebSocket server that will be part of this project.

## 2. Rework Goals

*   **Replace HTTP polling with WebSockets:** This will reduce latency and improve the efficiency of the signaling process.
*   **Integrate the signaling server:** The signaling server will be part of this repository, making the project self-contained and easier to run and maintain.
*   **Maintain the public API:** The public API of the React hooks and components should remain as consistent as possible to avoid major breaking changes for users of the library.

## 3. Rework Tasks

### Task 1: Create a WebSocket Signaling Server

A new signaling server needs to be created. It will be responsible for relaying WebRTC signaling messages between peers.

*   **Technology:** A lightweight WebSocket server is recommended. [Deno](https://deno.land/) with its native WebSocket support is a good option, especially since the original signaling server was Deno-based. Alternatively, a Node.js server with the `ws` library can be used.
*   **Location:** The server code should be placed in a `server/` directory in the root of the project.
*   **Functionality:**
    *   The server should manage WebSocket connections.
    *   It should implement a room-based system. Peers in the same room can communicate with each other. A "room" is identified by a string, which is already a concept in the current implementation.
    *   It should handle the following message types:
        *   `join-room`: A peer joins a room.
        *   `leave-room`: A peer leaves a room.
        *   `offer`: An offer message from an initiator.
        *   `answer`: An answer message from a responder.
        *   `ice-candidate`: An ICE candidate message.
    *   When a message is received from a peer, the server should relay it to the other peer in the same room.
*   **`package.json` script:** Add a script to `package.json` to run the server, for example: `"start:server": "deno run --allow-net server/main.ts"`.

### Task 2: Update the WebRTC `Peer` Class

The `Peer` class and its subclasses (`Initiator` and `Responder`) need to be updated to use the new WebSocket signaling server instead of HTTP polling.

*   **Remove HTTP polling:** The existing `fetch`-based logic in `acquireIceCandidatesLoop`, `getRemoteDescription`, `setAndShareLocalDescription`, and `shareNewIceCandidate` must be removed.
*   **WebSocket Client:**
    *   The `Peer` class should create and manage a `WebSocket` connection to the signaling server.
    *   The WebSocket server URL should be passed in the constructor, with a sensible default (e.g., `ws://localhost:8080`).
*   **Signaling Logic:**
    *   Upon connecting, the client should send a `join-room` message.
    *   When the `Peer` class needs to send a signaling message (offer, answer, or ICE candidate), it should send it over the WebSocket.
    *   The `Peer` class should listen for messages from the WebSocket and handle them accordingly (e.g., by calling `setRemoteDescription` or `addIceCandidate`).

### Task 3: Update React Hooks and Components

The React hooks (`useDevicePortalInput`, `useDevicePortalOutput`) and the `DevicePortalInput` component will need slight modifications to support the new signaling mechanism.

*   The hooks should be updated to allow specifying the WebSocket server URL. This could be an option passed to the hooks.
*   The default Storybook examples should be configured to work with the local signaling server.

### Task 4: Update Documentation and Examples

*   **`README.md`:** Update the `README.md` file to reflect the changes. Explain how to run the new signaling server and how to configure the WebSocket URL in the React components.
*   **Storybook:** The Storybook stories should be updated to demonstrate the new WebSocket-based communication. This might involve running the signaling server as part of the Storybook setup.

## Conclusion

This rework will make `react-device-portal` a more robust and self-contained project. By moving to WebSockets and including the signaling server, the project will be easier to develop, test, and use.
