"use strict"
const { DEBUG, VERBOSE } = require("./env")

const { class:klass } = require("ippankiban/lib/class")
const { createHash } = require("crypto")
const errors = require("./errors")
const { inherits } = require("util")
const { typeOf } = require("ippankiban/lib/type")
const { nextTick, hrtime } = process
const { Serializer: { serialize, objectify, stringify }} = require("ippankiban/lib/Serializer")
const { unlinkSync } = require("fs")

const { Event } = require("ippankiban/lib/Event")
const { Node } = require("ippankiban/lib/Node")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")
const { Server:NetServer } = require("net")
const { UnixSocket } = require("./UnixSocket")
const { SocketConnexion } = require("./socket_events")

module.exports.UnixSocketServer = klass(Node, ReadyStateFul, statics => {
    const servers = new WeakMap

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , [0b0]: { enumerable: true, value: "UNINITIALIZED"}
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , [0b1]: { enumerable: true, value: "INITIALIZING" }

      , LISTENING: { enumerable: true, value: 0b11 }
      , [0b11]: { enumerable: true, value: "LISTENING" }
      , EXITED: { enumerable: true, value: 0b100 }
      , [0b100]: { enumerable: true, value: "EXITED" }
    })

    const clientproxy = {
        get: (o, p) => servers.get(o).get("clients").get(p)
      , set: (o, p, v) => servers.get(o).get("clients").set(p, v)
    }

    return {
        constructor: function({ socket }={}){
            if ( DEBUG && !socket && !arguments[0] )
              console.trace()

            socket = !!socket ? socket
                   : typeOf(arguments[0]) == "string" ? arguments[0]
                   : void function(){ throw new TypeError(`${__filename}: ${errors.ERR_MISSING_SO_PATH}`) }()

            if ( typeOf(arguments[0]) == "string" )
              socket = arguments[0] || `/tmp/${uuid()}.sock`

            Reflect.apply(Node, this, [])
            servers.set(this, new Map)
            servers.get(this).set("socket_path", socket)
            servers.get(this).set("clients", new WeakSet)

            servers.get(this).set("ready", Promise.resolve()
            .then(() => new Promise(resolve => nextTick(() => {
                ReadyStateFul.readystateChange(this, module.exports.UnixSocketServer.INITIALIZING)
                resolve()
            })))
            .then(() => new Promise(resolve => {
                const onexit = code => {
                    process.removeListener("exit", onexit)
                    this.unref()

                    try {
                        unlinkSync(this.socket_path)
                    } catch(e){
                        switch(e.code) {
                            case "ENOENT":
                              if ( VERBOSE )
                                console.log(`[${__filename}] socket ${this.socket_path} was already deleted`)
                              break
                            default:
                              console.error(e)
                              break
                        }
                    }
                }

                const onerror = e => {
                    server.removeListener("error", onerror)
                    server.removeListener("listening", onlistening)
                    server.close(() => { throw e })
                }

                const onlistening = e => {
                    if ( VERBOSE )
                      console.log(`[${__filename}] socket ${this.socket_path} listening`)

                    this.removeListener("listening", onlistening)
                    this.dispatchEvent("listening")
                    process.addListener("exit", onexit)
                    resolve()
                }

                this.addListener("error", onerror)
                this.addListener("listening", onlistening)
                this.listen(servers.get(this).get("socket_path"))
            }))
            .then(() => this.addListener("connection", socket => {
                socket = UnixSocket.from( socket )
                this.clients.add(socket)

                const onclose = e => onend()
                const onend = e => {
                    this.clients.delete(socket)
                    socket.removeEventListener("end", onend)
                }
                const onerror = err => {
                    if ( VERBOSE )
                      console.error(err)
                    this.dispatchEvent("error", err)
                }
                const ontimeout = e => onend()

                socket.addListener("close", onclose)
                socket.addEventListener("end", onend)

                this.dispatchEvent(new SocketConnexion(socket))
            }))
            .then(() => ReadyStateFul.readystateChange(this, module.exports.UnixSocketServer.LISTENING)))

        }
      , clients: { enumerable: true,
            get: function(){ return servers.get(this).get("clients") }
        }
      , close: { enumerable: true,
            value: function(cb=Function.prototype){
                this.unref()
                return Reflect.apply(NetServer.prototype.close, this, [cb])
            }
        }
      , socket_path: { enumerable: true,
            get: function(){ return servers.get(this).get("socket_path") }
        }

      , server: { enumerable: true,
            get: function(){
              console.warn("UnixSocketServer::server is deprecated")
              return this
            }
        }
      , socket: { enumerable: true,
            get: function(){
                console.warn("UnixSocketServer::socket is deprecated")
                if ( DEBUG )
                  console.trace()
                return this.socket_path
            }
        }
    }
})

inherits(module.exports.UnixSocketServer, NetServer)
