"use strict"

const { spawnSync } = require("child_process")
const { class:klass } = require("ippankiban/lib/class")
const { createServer:createNetServer } = require("net")
const { nextTick } = process
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
        constructor: function(dict){
            dict = typeOf(dict) == "object" ? dict
                 : typeOf(dict) == "string" ? { socket: dict }
                 : {}
            Node.call(this)
            sockets.set(this, new Map)
            sockets.get(this).set("path", typeOf(dict.socket) == "string"
                                        ? dict.socket
                                        : `${tmp_dir}/${uuid()}.sock`)

            sockets.get(this).set("ready", Promise.resolve()
                .then(() => new Promise(resolve => {
                    nextTick(resolve)
                }))
                .then(()=> new Promise((resolve, reject) => {
                    const start = () => {
                        const server = createNetServer(socket => {
                            const _socket = new WebSocket(socket)

                            _socket.addEventListener("close", e => {
                                //sockets.get(this).set("readystate", module.exports.UnixSocketServer.CLOSED)
                                //this.dispatchEvent("close")
                            })

                            sockets.get(this).set("readystate", module.exports.UnixSocketServer.OPENED)
                            this.dispatchEvent(new SocketEvt(_socket))
                            this.dispatchEvent("open")
                        })

                        const onlistening = () => {
                            sockets.get(this).set("server", server)
                            sockets.get(this).set("readystate", module.exports.UnixSocketServer.LISTENING)
                            this.dispatchEvent("listening")
                            resolve()
                        }

                        const onerror = e => {
                          server.removeListener("error", onerror)
                          server.removeListener("listening", onlistening)
                          server.close(() => {
                              if ( e.code == "EADDRINUSE" ) {
                                  console.warn(`socket (${this.socket}) is busy, re-attempting...`)
                                  spawnSync("rm", ["-rf", this.socket])
                                  nextTick(start)
                              }
                              else throw e
                          })
                        }


                        server.addListener("error", onerror)
                        server.addListener("listening", onlistening)
                        server.listen(this.socket)
                    }

                    start()
                })))
        }
      , close: { enumerable: true,
            value: function(){
                console.log("attempt close")
            }
        }
      , socket: { enumerable: true,
            get: function(){ return sockets.get(this).get("path") }
        }
    }
})
