"use strict"

const { DEBUG, VERBOSE
      , sysctl
      } = require("./env")

const { class:klass } = require("ippankiban/lib/class")
const { createHash } = require("crypto")
const errors = require("./errors")
const { inherits } = require("util")
const { nextTick, hrtime } = process
const { typeOf } = require("ippankiban/lib/type")
const { UID: { uid:uuid } } = require("ippankiban/lib/UID")
const { Serializer: { serialize, objectify, stringify }} = require("ippankiban/lib/Serializer")

const { Event } = require("ippankiban/lib/Event")
const { EventTarget } = require("ippankiban/lib/EventTarget")
const { Socket:NetSocket } = require("net")
const { Node } = require("ippankiban/lib/Node")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")
const { SocketMessage, SocketTextMessage, SocketBinaryMessage } = require("./socket_events")

if ( VERBOSE )
console.log(`[${__filename}] net.core.somaxconn: ${sysctl["net.core.somaxconn"]}`)

module.exports.UnixSocketClient =
module.exports.UnixSocket = klass(Node, ReadyStateFul, statics => {
    const clients = new WeakMap

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , [0b0]: { enumerable: true, value: "UNINITIALIZED"}
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , [0b1]: { enumerable: true, value: "INITIALIZING" }

      , CONNECTED: { enumerable: true, value: 0b11 }
      , [0b11]: { enumerable: true, value: "CONNECTED" }
      , CLOSED: { enumerable: true, value: 0b100 }
      , [0b100]: { enumerable: true, value: "CLOSED" }

      , somaxconn: { enumerable: true,
            value: sysctl["net.core.somaxconn"]
        }

      , from: { enumerable: true,
            value: socket => {
                if ( !(socket instanceof NetSocket) )
                  throw new TypeError(errors.TODO) //TODO

                socket.__proto__ = module.exports.UnixSocket.prototype
                Reflect.apply(Node, socket, [])
                clients.set(socket, new Map)
                clients.get(socket).set("uuid", uuid())
                clients.get(socket).set("op", Promise.resolve())
                clients.get(socket).set("munch", Promise.resolve({ buffer: Buffer.alloc(0) }))
                clients.get(socket).set("ready", ready(socket, { connect: false }))
                return socket
            }
        }
    })

    /* websocket message diagram
    0               1               2               3
    0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0
    +-+-+-+-+-------+-+-------------+-------------------------------+
    |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
    |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
    |N|V|V|V|       |S|             |   (if payload len==126/127)   |
    | |1|2|3|       |K|             |                               |
    +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
    |     Extended payload length continued, if payload len == 127  |
    + - - - - - - - - - - - - - - - +-------------------------------+
    |                               |Masking-key, if MASK set to 1  |
    +-------------------------------+-------------------------------+
    | Masking-key (continued)       |          Payload Data         |
    +-------------------------------- - - - - - - - - - - - - - - - +
    :                     Payload Data continued ...                :
    + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
    |                     Payload Data continued ...                |
    +---------------------------------------------------------------+
    */

    const message = (socket, message) => Reflect.apply(function(message){
        const event = new SocketMessage(message)
        Event.keepAlive(event)
        this.dispatchEvent(event)

        switch( event.op ) {
            case "text":
              this.dispatchEvent(new SocketTextMessage(message))
              break
            case "binary":
              this.dispatchEvent(new SocketBinaryMessage(message))
              break
        }

        Event.destroy(event)
    }, socket, [message])

    const crunch = (socket, chunk) => Reflect.apply(function(chunk){
        clients.get(this).set("munch", clients.get(this).get("munch").then(({ buffer, header }) => new Promise(resolve => {
            buffer = Buffer.concat([buffer, chunk])

            // we need 2 bytes of data to get an idea of the length of the message
            // if message is longer than > 126, we need 6 bytes, and if there's not enough data
            // we'll wait for the next chunk
            // a full header is between 2 & 14 bytes

            if ( !header ) {
                const view = buffer.readUInt8(1)
                const masked = !!(view & 0x80)
                const len = (view & 0x7f)

                if (
                    ( len > 126 && masked && buffer.length < 14 ) // case 1 : masked && length > 127
                 || ( len > 126 && !masked && buffer.length < 6 ) // case 1 : masked && length > 127
               ) return resolve({ buffer }) // return & wait next chunk

                const start = len < 126 && masked ? 6
                            : len < 126 && !masked ? 2
                            : len == 126 && masked ? 8
                            : len == 126 && !masked ? 4
                            : masked ? 14
                            : 10

                // divide header and raw data (payload)
                header = buffer.slice(0, start)
                buffer = buffer.slice(start)
            }

            const view = header.readUInt8(1)
            const len = (view & 0x7f)
            const length = len < 126 ? len
                         : len == 126 ? header.readUInt16BE(2)
                         : (header.readUInt32BE(2) << 8) + header.readUInt32BE(6)

            if ( buffer.length < length )
              return resolve({ buffer, header })

            message(this, Buffer.concat([header, buffer.slice(0, length)]))
            buffer = buffer.slice(length)

            resolve({ buffer })
        })))
    }, socket, [chunk])

    const ready = function(socket, { connect=true }){
        return function(){
            return Promise.resolve()
              .then(() => new Promise(resolve => nextTick(() => {
                  ReadyStateFul.readystateChange(this, module.exports.UnixSocket.INITIALIZING)
                  resolve()
              })))
              .then(() => {
                  const onclose = e => {
                      onend()
                  }

                  const ondrain = e => console.log(`[${__filename}] drain event`)
                  const onend = e => {
                      this.removeListener("close", onclose)
                      this.removeListener("drain", ondrain)
                      this.removeListener("end", onend)
                      this.removeListener("error", onerror)
                      this.removeListener("timeout", ontimeout)
                      this.removeListener("data", ondata)
                      this.dispatchEvent("end")
                  }
                  const onerror = err => {
                      if ( VERBOSE )
                        console.error(err)
                      this.dispatchEvent("error", err)
                  }
                  const onexit = code => {
                      process.removeListener("exit", onexit)
                      this.unref()
                  }
                  const ontimeout = e => onend()

                  this.addListener("close", onclose)
                  this.addListener("drain", ondrain)
                  this.addListener("end", onend)
                  this.addListener("error", onerror)
                  this.addListener("timeout", ontimeout)

                  const ondata = chunk => crunch(this, chunk)
                  this.addListener("data", ondata)
              })
              .then(() => new Promise(resolve => {
                    const onconnect = e => {
                        if ( connect )
                          this.removeListener("connect", onconnect)
                        process.addListener("exit", onexit)
                        this.setKeepAlive(true)
                        resolve()
                    }

                    const onexit = code => {
                        process.removeListener("exit", onexit)
                        this.unref()
                    }

                    if ( !connect )
                      onconnect()
                    else
                      this.addListener("connect", onconnect),
                      this.connect(this.socket_path)
              }))
              .then(() => ReadyStateFul.readystateChange(this, module.exports.UnixSocket.CONNECTED))
        }.call(socket)
    }


    return {
        constructor: function({ socket }={}){
            if ( typeOf(arguments[0]) == "string" )
              socket = arguments[0] || `/tmp/${uuid()}.sock`

            Reflect.apply(Node, this, [])
            Reflect.apply(NetSocket, this, [])
            clients.set(this, new Map)
            clients.get(this).set("socket_path", socket)
            clients.get(this).set("uuid", uuid())
            clients.get(this).set("op", Promise.resolve())
            clients.get(this).set("munch", Promise.resolve({ buffer: Buffer.alloc(0) }))
            clients.get(this).set("ready", ready(this, { connect: true }))
        }
      , close: { enumerable: true,
            value: function(cb = Function.prototype){
                this.unref()
                this.destroy()
            }
        }
      , send: { enumerable: true,
            value: function(...args){
                const cb = typeOf(args[args.length-1]) == "function" ? args.pop() : Function.prototype

                clients.get(this).set("op", clients.get(this).get("op").then(() => new Promise((resolve, reject) => {
                    let error

                    const fin = true
                    const masked = false
                    const cb = typeOf(args[args.length-1]) == "function" ? cb : Function.prototype
                    const encoding = args.length > 1 && typeOf(args[args.length-1]) == "string" ? args.pop() : "utf8"
                    let opcode = SocketMessage.text // text frame by default

                    const payload = (args[0] instanceof Buffer || args[0] instanceof ArrayBuffer) ? (opcode = SocketMessage.binary, args.shift())
                              : typeOf(args[0]) == "string" ? Buffer.from(args.shift(), encoding)
                              : typeOf(args[0]) == "object" ? Buffer.from(JSON.stringify(args.shift()), encoding)
                              : (error = new TypeError(errors.ERR_WRITE_MSG), null)

                    if ( VERBOSE )
                      console.log(`[${__filename}] payload (typeof, value):`, typeof args[0], args[0])
                    if ( DEBUG && !!error)
                      console.log(`[${__filename}] empty payload, stack:`, error.stack)

                    if ( error )
                      return reject(error)


                    const header = Buffer.alloc(2)
                    const len = payload.length < 0x7e ? payload.length
                              : payload.length <= 0xffff ? 0x7e
                              : 0x7f
                    const length = len < 0x7e ? Buffer.alloc(0)
                                 : len == 0x7e ? function(buffer){
                                                    buffer.writeUInt16BE(payload.length)
                                                    return buffer
                                                }(Buffer.alloc(2))
                                 : function(buffer){ //TODO TEST!, find a pretttier way?
                                       const bin = payload.length.toString(2).split("")
                                       buffer.writeUInt32BE(parseInt(bin.splice(-32).join("")||"0", 2), 4)
                                       buffer.writeUInt32BE(parseInt(bin.splice(-32).join("")||"0", 2), 0)
                                       return buffer
                                   }(Buffer.alloc(8))

                    const mask = !!masked ? Buffer.from( new Uint32Array(4).fill(0) ) : Buffer.alloc(0) //TODO add mask
                    header[0] = 0x0 |(fin?0x80:0) | opcode
                    header[1] = 0x0 |(masked?0x80:0) | len

                    const frame = Buffer.concat([header, length, mask, payload])

                    let attempt = 0
                    const write = () => {
                        attempt++
                        Reflect.apply(NetSocket.prototype.write, this, [frame, encoding, (err) => {
                            if ( err ) {
                                if ( attempt <= 10 )
                                  return setTimeout(write, 100 + Math.random()*900)
                                else
                                  return reject(err)
                            }

                            cb(null)
                            resolve()
                        }])
                    }

                    write()
                })
                .catch(e => {
                  if ( DEBUG )
                    console.error(e)
                    console.trace()
                    cb(e)
                })))
            }
        }
      , socket_path: { enumerable: true,
            get: function(){ return clients.get(this).get("socket_path") }
        }
      , uuid: { enumerable: true,
            get: function(){ return clients.get(this).get("uuid") }
        }
    }
})

inherits(module.exports.UnixSocket, NetSocket)
module.exports.UnixSocket.prototype.write =
module.exports.UnixSocket.prototype.end =
module.exports.UnixSocket.prototype.send
