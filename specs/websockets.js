"use strict"

const { request:httpRequest } = require("http")

const { Server } = require("../lib/Server")
const { WebSocket, WebSocketUpgrade } = require("../lib/WebSocketUpgrade")

const getServer = async (port) => new Promise(resolve => {
    console.log(`getServer(${port})`)

    const server = new Server
    const wsupgrade = new WebSocketUpgrade(server)

    server.once("listening", e => {
        console.log("server listening")
        resolve({ server, wsupgrade })
    })

    wsupgrade.addEventListener("socket", ({socket}) => {
        console.log("server socket connected")

        socket.addEventListener("message", e => {
          const msg = e.unmask()
          console.log("message: server <=", msg)

          setTimeout(() => socket.send(msg), 1000)

        })
    })

    server.addRouteHandler("*", (route, next) => {
        route.wait(done => {
            console.log("request", route.path)

            route.response.end("ok")
            done()
            next(true)
        })
    })

    server.listen(port)
})

const getConnection = async (port) => new Promise(resolve => {
    const request = httpRequest({
        hostname: "localhost", port, method: "GET", path:"/foo"
      , headers: {
            Connection: "Upgrade"
          , Upgrade: "websocket"
        }
    })

    request.once("upgrade", ({socket:_socket}) => {
        console.log("request upgrade")
        const socket = new WebSocket(_socket)

        socket.addEventListener("message", e => {
            const msg = e.unmask()
            console.log("message: websocket <=", msg)

            setTimeout(() => socket.send(msg), 1000)
        })

        resolve({ socket })
    })

    request.end()
})

const main = async (port) => {
    const { server, wsupgrade } = await getServer(port)
    const { socket } = await getConnection(port)

    socket.send("foo")
}

main(1337)
