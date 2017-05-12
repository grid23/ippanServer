"use strict"

const { DEBUG, VERBOSE } = require("./env")

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

                  const ondrain = () => {}//console.log(`[${__filename}] drain event`) //TODO?
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

                clients.get(this).set("op", clients.get(this).get("op").then(() => new Promise(resolve => {
                    const fin = true
                    const masked = false
                    const cb = typeOf(args[args.length-1]) == "function" ? cb : Function.prototype
                    const encoding = args.length > 1 && typeOf(args[args.length-1]) == "string" ? args.pop() : "utf8"
                    let opcode = SocketMessage.text // text frame by default
                    const payload = (args[0] instanceof Buffer || args[0] instanceof ArrayBuffer) ? (opcode = SocketMessage.binary, args.shift())
                              : typeOf(args[0]) == "string" ? Buffer.from(args.shift(), encoding)
                              : typeOf(args[0]) == "object" ? Buffer.from(JSON.stringify(args.shift), encoding)
                              : void function(){ this.dispatchEvent("error", new TypeError(errors.ERR_WRITE_MSG)) }.call(this)
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

                    Reflect.apply(NetSocket.prototype.write, this, [frame, encoding, () => {
                        cb()
                        resolve()
                    }])
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





//
// "use strict"
//
// const argv = new Set( process.argv.slice(2) )
// const VERBOSE = argv.has("--VERBOSE") || argv.has("--verbose")
// const { USOCK_BUFFER_SIZE } = require("./max_usock_buffer")
//
// const { class:klass } = require("ippankiban/lib/class")
// const errors = require("./errors")
// const { typeOf } = require("ippankiban/lib/type")
// const { nextTick } = process
//
// const { Event, _eventWM:eventWM } = require("ippankiban/lib/Event")
// const { EventTarget } = require("ippankiban/lib/EventTarget")
// const { Socket:NetSocket } = require("net")
//
// const CloseEvent = klass(Event, statics => {
//
//     return {
//         constructor: function(){
//             Event.call(this, "close")
//         }
//     }
// })
//
// const MessageEvent = klass(Event, statics => {
//     const events = eventWM
//
//     return {
//         constructor: function({ buffer }){
//             Event.call(this, "message")
//
//             events.get(this).set("payload", buffer.toString())
//         }
//       , data: { enumerable: true,
//             get: function(){ return events.get(this).get("payload") }
//         }
//       , origin: { enumerable: true,
//             get: function(){} //TODO
//         }
//       , ports: { enumerable: true,
//             get: function(){} //TODO
//         }
//       , source: { enumerable: true,
//             get: function(){} //TODO
//         }
//     }
// })
//
// const OpenEvent = klass(Event, statics => {
//     const events = eventWM
//
//     return {
//         constructor: function(){
//             Event.call(this, "open")
//         }
//     }
// })
//
// const SocketMessageEvt = klass(Event, statics => {
//     const events = eventWM
//
//     const ops = {
//         1: "text"
//       , 2: "binary"
//       , 8: "close"
//       , 9: "ping"
//       ,10: "pong"
//     }
//
//     return {
//         constructor: function({ buffer, fin, rsv1, rsv2, rsv3, opcode, masked, length, start, mask }){
//             Event.call(this, "rawmessage")
//
//             events.get(this).set("buffer", buffer)
//             events.get(this).set("fin", fin)
//             events.get(this).set("rsv1", rsv1)
//             events.get(this).set("rsv2", rsv2)
//             events.get(this).set("rsv3", rsv3)
//             events.get(this).set("opcode", opcode)
//             events.get(this).set("op", ops[opcode])
//             events.get(this).set("masked", masked)
//             events.get(this).set("mask", mask)
//             events.get(this).set("length", length)
//             events.get(this).set("start", start)
//         }
//       , fin: { enumerable: true,
//             get: function(){ return events.get(this).get("fin") }
//         }
//       , length: { enumerable: true,
//             get: function(){ return events.get(this).get("length") }
//         }
//       , mask: { enumerable: true,
//             get: function(){ return events.get(this).get("mask") }
//         }
//       , op: { enumerable: true,
//             get: function(){ return events.get(this).get("op") }
//         }
//       , opcode: { enumerable: true,
//             get: function(){ return events.get(this).get("opcode") }
//         }
//       , payload: { enumerable: true,
//             get: function(){
//                 return events.get(this).get("buffer").slice(events.get(this).get("start")).toString("utf8")
//             }
//         }
//       , unmask: { enumerable: true,
//             value: function(){
//                 if ( !events.get(this).get("masked") )
//                   return this.payload
//
//                 const view = events.get(this).get("buffer").slice(events.get(this).get("start"))
//                 const decoded = []
//                 for ( let [i, v] of view.entries() )
//                   decoded.push(v ^ events.get(this).get("mask")[i%4])
//
//                 return Buffer.from(decoded).toString("utf8")
//             }
//         }
//     }
// })
//
// module.exports.UnixSocket = klass(EventTarget, statics => {
//     const sockets = new WeakMap
//     const defaultBinaryType = "blob"
//
//     Object.defineProperties(statics, {
//         CONNECTING: { enumerable: true,
//             value: 0
//         }
//       , OPEN: { enumerable: true,
//             value: 1
//         }
//       , CLOSING: { enumerable: true,
//             value: 2
//         }
//       , CLOSED: { enumerable: true,
//             value: 3
//         }
//       , USOCK_BUFFER_SIZE: { enumerable: true,
//             value: USOCK_BUFFER_SIZE //TODO get a clear idea how to define max frame size by OS
//         }
//     })
//
//     const ping = socket => {
//         return new Promise(resolve => {
//             const buffer = new Buffer(2)
//             buffer.writeUInt16BE(0x8900, 0)
//
//             socket.write(buffer, "binary", () => resolve)
//         })
//     }
//
//     const pong = socket => {
//         return new Promise(resolve => {
//             const buffer = new Buffer(2)
//             buffer.writeUInt16BE(0x8a00, 0)
//
//             socket.write(buffer, "binary", () => resolve)
//         })
//     }
//
//     return {
//         constructor: function(...args){
//             sockets.set(this, new Map)
//             sockets.get(this).set("readyState", module.exports.UnixSocket.CONNECTING)
//             sockets.get(this).set("path", args[0] && typeOf(args[0]) == "string" ? args.shift()
//                                   : function(){ throw new TypeError("socket path expected") }())
//             sockets.get(this).set("op", Promise.resolve())
//             sockets.get(this).set("frame_buffer", [])
//
//             new Promise((resolve, reject) => {
//                 sockets.get(this).set("socket", new NetSocket)
//
//                 const onend = () => {
//                     sockets.get(this).set("readyState", module.exports.UnixSocket.CLOSED)
//                     this.dispatchEvent("close")
//                 }
//                 sockets.get(this).get("socket").on("end", onend)
//                 sockets.get(this).get("socket").on("close", onend)
//                 sockets.get(this).get("socket").on("timeout", onend)
//
//                 sockets.get(this).get("socket").addListener("connect", e => {
//                     sockets.get(this).set("readyState", module.exports.UnixSocket.OPEN)
//                       this.dispatchEvent(new OpenEvent)
//
//                     sockets.get(this).get("socket").addListener("data", buffer => {
//                         let view = buffer.readUInt8(0)
//                         const fin =  !!(view & 0x80)
//                         const rsv1 = view & 0x40
//                         const rsv2 = view & 0x20
//                         const rsv3 = view & 0x10
//                         const opcode = view & 0xf
//
//                         view = buffer.readUInt8(1)
//                         const masked = !!(view & 0x80)
//                         const {length, mask, start} = function(){
//                             const len = (view & 0x7f)
//                             const length = len < 126 ? len
//                                          : len == 126 ? buffer.readUInt16BE(2)
//                                          : (buffer.readUInt32BE(2) << 8) + buffer.readUInt32BE(6)
//                             const mask = !masked ? 0
//                                        : len < 126 ? buffer.slice(2,6)
//                                        : len == 126 ? buffer.slice(4, 8)
//                                        : buffer.slice(10,14)
//                             const start = len < 126 && masked ? 6
//                                         : len < 126 && !masked ? 2
//                                         : len == 126 && masked ? 8
//                                         : len == 126 && !masked ? 4
//                                         : masked ? 14
//                                         : 10
//                             return { length, mask, start }
//                         }()
//
//                         if ( opcode == 10   ) { //todo pong
//                         }
//                         else if ( opcode == 9 ) { //TODO ping
//                             nextTick(() => pong(sockets.get(this).get("socket")))
//                         }
//                         else if ( opcode == 8 ) { //TODO close
//                         }
//                         else {
//                             const socketMessageEvt = new SocketMessageEvt({ buffer, fin, rsv1, rsv2, rsv3, opcode, masked, length, start, mask })
//                             Event.keepAlive(socketMessageEvt)
//                             this.dispatchEvent(socketMessageEvt)
//
//                             //store the unmasked payload in the frame_buffer
//                             sockets.get(this).get("frame_buffer").push(function(){
//                                 const view = buffer.slice(start)
//                                 const decoded = []
//
//                                 for ( let [i, v] of view.entries() )
//                                   decoded.push(v ^ mask[i%4])
//                                 return Buffer.from(decoded)
//                             }.call(this))
//
//                             if ( !!fin ) {
//                                 const parts = []
//                                 while ( sockets.get(this).get("frame_buffer").length )
//                                   parts.push(sockets.get(this).get("frame_buffer").shift())
//                                 const full = Buffer.concat(parts)
//
//                                 switch ( socketMessageEvt.op ) {
//                                     case "text":
//                                         this.dispatchEvent(new MessageEvent({ buffer:full }))
//                                         break
//                                     case "binary": //TODO discriminate text/binary events
//                                         this.dispatchEvent(new MessageEvent({ buffer:full }))
//                                         break
//                                     default:
//                                         return
//                                 }
//                             }
//
//                             Event.destroy(socketMessageEvt)
//                         }
//                     })
//
//                 })
//
//                 sockets.get(this).get("socket").connect(sockets.get(this).get("path"))
//             })
//         }
//       , binaryType: { enumerable: true,
//             get: function(){ return sockets.get(this).get("binaryType") || defaultBinaryType }
//           , set: function(v){
//                 if ( ["blob", "arraybuffer"].indexOf(v) !== -1 )
//                     sockets.get(this).set("binaryType", v)
//             }
//         }
//       , bufferedAmount: { enumerable: true,
//             get: function(){} //TODO
//         }
//       , close: { enumerable: true,
//             value: function(){
//                 if ( !sockets.get(this).get("socket").destroyed )
//                   sockets.get(this).get("socket").unref()
//             }
//         }
//       , extensions: { enumerable: true,
//             get: function(){ return "" } //TODO?
//         }
//       , onclose: { enumerable: true,
//             get: function(){ return sockets.get(this).get("onclose") || null }
//           , set: function(v){
//                 if ( !v && sockets.get(this).has("onclose") )
//                   this.removeEventListener("close", sockets.get(this).get("onclose"))
//
//                 if ( typeOf(v) !== "function" )
//                   return
//
//                 if ( sockets.get(this).has("onclose") )
//                   this.removeEventListener("close", sockets.get(this).get("onclose"))
//
//                 sockets.get(this).set("onclose", v)
//                 this.addEventListener("close", sockets.get(this).get("onclose"))
//             }
//         }
//       , onerror: { enumerable: true,
//             get: function(){ return sockets.get(this).get("onerror") || null }
//           , set: function(v){
//                 if ( !v && sockets.get(this).has("onerror") )
//                   this.removeEventListener("error", sockets.get(this).get("onerror"))
//
//                 if ( typeOf(v) !== "function" )
//                   return
//
//                 if ( sockets.get(this).has("onerror") )
//                   this.removeEventListener("error", sockets.get(this).get("onerror"))
//
//                 sockets.get(this).set("onerror", v)
//                 this.addEventListener("error", sockets.get(this).get("onerror"))
//             }
//         }
//       , onmessage: { enumerable: true,
//             get: function(){ return sockets.get(this).get("onmessage") || null }
//           , set: function(v){
//                 if ( !v && sockets.get(this).has("onmessage") )
//                   this.removeEventListener("message", sockets.get(this).get("onmessage"))
//
//                 if ( typeOf(v) !== "function" )
//                   return
//
//                 if ( sockets.get(this).has("onmessage") )
//                   this.removeEventListener("message", sockets.get(this).get("onmessage"))
//
//                 sockets.get(this).set("onmessage", v)
//                 this.addEventListener("message", sockets.get(this).get("onmessage"))
//             }
//         }
//       , onopen: { enumerable: true,
//             get: function(){ return sockets.get(this).get("onopen") || null }
//           , set: function(v){
//                 if ( !v && sockets.get(this).has("onopen") )
//                   this.removeEventListener("open", sockets.get(this).get("onopen"))
//
//                 if ( typeOf(v) !== "function" )
//                   return
//
//                 if ( sockets.get(this).has("onopen") )
//                   this.removeEventListener("open", sockets.get(this).get("onopen"))
//
//                 sockets.get(this).set("onopen", v)
//                 this.addEventListener("open", sockets.get(this).get("onopen"))
//             }
//         }
//       , protocol: { enumerable: true,
//             get: function(){ return sockets.get(this).get("protocol") }
//         }
//       , readyState: { enumerable: true,
//             get: function(){ return sockets.get(this).get("readyState") }
//         }
//       , send: { enumerable: true,
//             value: function(msg){
//                 const masked = true
//                 const stringify = false
//                 let opcode
//
//                 msg = msg instanceof Buffer ? (opcode = 0x1, msg)
//                     : msg instanceof ArrayBuffer ? (opcode = 0x2, msg)
//                     : typeOf(msg) == "string" ? (opcode = 0x1, Buffer.from(msg))
//                     : void function UnixSocketSendError(){ throw new TypeErrror(errors.ERR_NOT_A_STRING) }()
//
//                 // the message will be cut in smaller pieces
//                 const parts = new Array(Math.ceil(msg.length / module.exports.UnixSocket.USOCK_BUFFER_SIZE ))
//                               .fill(null).map((a,i) => {
//                                   const start = i*module.exports.UnixSocket.USOCK_BUFFER_SIZE
//                                   const end = Math.min((i+1)*module.exports.UnixSocket.USOCK_BUFFER_SIZE, msg.length)
//                                   const part = msg.slice(start, end)
//
//                                   if ( VERBOSE )
//                                      console.log(`[${__filename}, pid: ${process.pid}] slicing message, from ${start} to ${end} (not inclusive) ( size: ${part.length}bytes )`)
//
//                                   return part
//                               })
//
//                 sockets.get(this).set("op", sockets.get(this).get("op").then(() => {
//                     let processing = Promise.resolve()
//
//                     while ( parts.length ) {
//                         const payload = parts.shift()
//                         const fin = +(!parts.length)
//
//                         processing = processing.then(() => new Promise(resolve => {
//                             const header = Buffer.alloc(2)
//                             const {len, length} = function(){
//                                 const len = payload.length < 0x7e ? payload.length
//                                           : payload.length <= 0xffff ? 0x7e
//                                           : 0x7f
//                                 const length = len < 0x7e ? Buffer.alloc(0)
//                                              : len == 0x7e ? function(buffer){
//                                                     buffer.writeUInt16BE(payload.length)
//                                                     return buffer
//                                                 }( Buffer.alloc(2) )
//                                              :  function(buffer){ //TODO TEST!, find a pretttier way?
//                                                     const bin = payload.length.toString(2).split("")
//                                                     buffer.writeUInt32BE(parseInt(bin.splice(-32).join("")||"0", 2), 4)
//                                                     buffer.writeUInt32BE(parseInt(bin.splice(-32).join("")||"0", 2), 0)
//                                                     return buffer
//                                                 }( Buffer.alloc(8) )
//                                 return { len, length }
//                             }()
//
//                             const mask = !!masked ? Buffer.from( new Uint32Array(4).fill(0) ) : Buffer.alloc(0) //TODO add mask
//                             header[0] = 0x0 |(fin?0x80:0) | opcode
//                             header[1] = 0x0 |(masked?0x80:0) | len
//
//                             const frame = Buffer.concat([header, length, mask, payload])
//                             sockets.get(this).get("socket").write(frame, "binary", () => setTimeout(resolve, 4))
//                         }))
//                     }
//
//                     return processing
//                 }))
//
//                 sockets.get(this).get("op")
//             }
//         }
//       // , send_: { enumerable: true,
//       //       value: function(msg){ // see WebSocketUpgrade.frame_{text, binary}
//       //           const fin = true
//       //           const masked = true
//       //           const stringify = false
//       //           const opcode = typeOf(msg) == "string" ? 0x1
//       //                        : msg instanceof ArrayBuffer ? 0x2
//       //                        : void function(){ throw new TypeError(errors.TODO) }()
//       //
//       //           sockets.get(this).set("op", sockets.get(this).get("op").then(() => new Promise((resolve, reject) => {
//       //               const onerror = e => { reject(e) }
//       //
//       //               try {
//       //                   msg = Buffer.from(msg)
//       //               } catch(e){ return onerror(e)  }
//       //
//       //               const payload = Buffer.from(msg)
//       //               const header = Buffer.alloc(2)
//       //               const {len, length} = function(){
//       //                   const len = payload.length < 0x7e ? payload.length
//       //                             : payload.length <= 0xffff ? 0x7e
//       //                             : 0x7f
//       //                   const length = len < 0x7e ? Buffer.alloc(0)
//       //                                : len == 0x7e ? function(buffer){ buffer.writeUInt16BE(payload.length); return buffer }(Buffer.alloc(2))
//       //                                :  function(buffer){ //TODO TEST!, find a pretttier way?
//       //                                       const bin = payload.length.toString(2).split("")
//       //                                       buffer.writeUInt32BE(parseInt(bin.splice(-32).join("")||"0", 2), 4)
//       //                                       buffer.writeUInt32BE(parseInt(bin.splice(-32).join("")||"0", 2), 0)
//       //                                       return buffer
//       //                                   }(Buffer.alloc(8))
//       //
//       //                   return { len, length }
//       //               }()
//       //               const mask = !!masked ? Buffer.from( new Uint32Array(4).fill(0) ) : Buffer.alloc(0) //TODO add mask
//       //               header[0] = 0x0 |(fin?0x80:0) | opcode
//       //               header[1] = 0x0 |(masked?0x80:0) | len
//       //
//       //               const frame = Buffer.concat([header, length, mask, payload])
//       //
//       //               sockets.get(this).get("socket").write(frame, "binary", () => nextTick(resolve))
//       //           })
//       //           .catch(e => {
//       //               console.error(e)
//       //               throw e
//       //           })))
//       //
//       //           return sockets.get(this).get("op")
//       //       }
//       //   }
//       , url: { enumerable: true,
//             get: function(){ return sockets.get(this).get("resolved_url") }
//         }
//     }
// })
