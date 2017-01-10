"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { createServer:createNetServer } = require("net")
const { typeOf } = require("ippankiban/lib/type")

const { Event, _eventWM:events } = require("ippankiban/lib/Event")
const { Node } = require("ippankiban/lib/Node")
const { SocketEvt, WebSocket } = require("./WebSocketUpgrade")
const { UID:{ uid:uuid } } = require("ippankiban/lib/UID")

module.exports.UnixSocketServer = klass(Node, statics => {
    const sockets = new WeakMap

    let tmp_dir = ["darwin", "linux", "freebsd"].indexOf(process.platform) !== -1
                ? "/tmp"
                // : process.platform == "win32"
                // ? "" //TODO
                : void function(){ console.warn("unspecified tmp path for the current platform") }()

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0 }
      , LISTENING: { enumerable: true, value: 1 }
      , OPENED: { enumerable: true, value: 2 }
      , CLOSED: { enumerable: true, value: 3 }
    })

    return {
        constructor: function(){
            Node.call(this)
            sockets.set(this, new Map)
            sockets.get(this).set("path", `${tmp_dir}/${uuid()}.sock`)

            sockets.get(this).set("ready", new Promise((resolve, reject) => {
                const server = createNetServer(socket => {
                    const _socket = new WebSocket(socket)

                    _socket.addEventListener("close", e => {
                        sockets.get(this).set("readystate", module.exports.UnixSocketServer.CLOSED)
                        this.dispatchEvent("close")
                        this.close()
                    })

                    sockets.get(this).set("readystate", module.exports.UnixSocketServer.OPENED)
                    this.dispatchEvent(new SocketEvt(_socket))
                    this.dispatchEvent("open")
                })

                server.addListener("listening", () => {
                    sockets.get(this).set("readystate", module.exports.UnixSocketServer.LISTENING)
                    this.dispatchEvent("listening")
                    resolve()
                })

                server.listen(this.socket)
                sockets.get(this).set("server", server)
            }))
        }
      , socket: { enumerable: true,
            get: function(){ return sockets.get(this).get("path") }
        }
    }
})
