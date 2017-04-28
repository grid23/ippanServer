"use strict"

const argv = new Set( process.argv.slice(2) )
const VERBOSE = argv.has("--VERBOSE") || argv.has("--verbose")

const crypto = require("crypto")
const errors = require("./errors")
const eventWM = require("ippankiban/lib/Event")._eventWM
const klass = require("ippankiban/lib/class").class
const typeOf = require("ippankiban/lib/type").typeOf
//const path = require("path")

const Event = require("ippankiban/lib/Event").Event
const Node = require("ippankiban/lib/Node").Node
const SecureServer = require("./SecureServer").SecureServer
const Server = require("./Server").Server
const Socket = require("net").Socket
const UID = require("ippankiban/lib/UID").UID

module.exports.SocketEvt = klass(Event, statics => {
    const events = eventWM

    Object.defineProperties(statics, {
        "NAME": { enumerable: true,
            value: "socket"
        }
    })

    return {
        constructor: function(socket){
            if ( !module.exports.WebSocket.isImplementedBy(socket) )
              throw new TypeError(errors.TODO)

            Event.call(this, module.exports.SocketEvt.NAME)
            events.get(this).set("socket", socket)
        }
      , socket: {  enumerable: true,
            get: function(){ return events.get(this).get("socket") }
        }
    }
})

const ops = {
    1: "text"
  , 2: "binary"
  , 8: "close"
  , 9: "ping"
  ,10: "pong"
}

const SocketMessageEvt = klass(Event, statics => {
    const events = eventWM

    Object.defineProperties(statics, {
        NAME: { enumerable: true,
            value: "message"
        }
    })

    return {
        constructor: function({ buffer, fin, rsv1, rsv2, rsv3, opcode, masked, length, start, mask }){
            Event.call(this, SocketMessageEvt.NAME)
            events.get(this).set("buffer", buffer)
            events.get(this).set("fin", fin)
            events.get(this).set("rsv1", rsv1)
            events.get(this).set("rsv2", rsv2)
            events.get(this).set("rsv3", rsv3)
            events.get(this).set("opcode", opcode)
            events.get(this).set("op", ops[opcode])
            events.get(this).set("masked", masked)
            events.get(this).set("mask", mask)
            events.get(this).set("length", length)
            events.get(this).set("start", start)
        }
      , fin: { enumerable: true,
            get: function(){ return events.get(this).get("fin") }
        }
      , length: { enumerable: true,
            get: function(){ return events.get(this).get("length") }
        }
      , mask: { enumerable: true,
            get: function(){ return events.get(this).get("mask") }
        }
      , op: { enumerable: true,
            get: function(){ return events.get(this).get("op") }
        }
      , opcode: { enumerable: true,
            get: function(){ return events.get(this).get("opcode") }
        }
      , payload: { enumerable: true,
            get: function(){
                return events.get(this).get("buffer").slice(events.get(this).get("start")).toString("utf8")
            }
        }
      , unmask: { enumerable: true, configurable: true,
            value: function(){
                if ( !events.get(this).get("masked") )
                  return this.payload

                const view = events.get(this).get("buffer").slice(events.get(this).get("start"))
                const decoded = []

                for ( let [i, v] of view.entries() )
                  decoded.push(v ^ this.mask[i%4])

                return Buffer.from(decoded).toString("utf8")
            }
        }
    }
})

const SocketTextMessageEvt = klass(SocketMessageEvt, statics => {
    const events = eventWM

    Object.defineProperties(statics, {
        NAME: { enumerable: true,
            value: "textframe"
        }
    })

    return {
        constructor: function({ buffer, fin, rsv1, rsv2, rsv3, opcode, masked, length, start, mask }){
            Event.call(this, SocketTextMessageEvt.NAME)
            events.get(this).set("buffer", buffer)
            events.get(this).set("fin", fin)
            events.get(this).set("rsv1", rsv1)
            events.get(this).set("rsv2", rsv2)
            events.get(this).set("rsv3", rsv3)
            events.get(this).set("opcode", opcode)
            events.get(this).set("op", ops[opcode])
            events.get(this).set("masked", masked)
            events.get(this).set("mask", mask)
            events.get(this).set("length", length)
            events.get(this).set("start", start)
        }
      , unmask: { enumerable: true,
            value: function(){ return events.get(this).get("buffer").toString("utf8") }
        }
    }
})

const SocketBinaryMessageEvt = klass(SocketMessageEvt, statics => {
    const events = eventWM

    Object.defineProperties(statics, {
        NAME: { enumerable: true,
            value: "binaryframe"
        }
    })

    return {
        constructor: function({ buffer, fin, rsv1, rsv2, rsv3, opcode, masked, length, start, mask }){
            Event.call(this, SocketBinaryMessageEvt.NAME)

            events.get(this).set("buffer", buffer)
            events.get(this).set("fin", fin)
            events.get(this).set("rsv1", rsv1)
            events.get(this).set("rsv2", rsv2)
            events.get(this).set("rsv3", rsv3)
            events.get(this).set("opcode", opcode)
            events.get(this).set("op", ops[opcode])
            events.get(this).set("masked", masked)
            events.get(this).set("mask", mask)
            events.get(this).set("length", length)
            events.get(this).set("start", start)
        }
      , unmask: { enumerable: true,
            value: function(){ return events.get(this).get("buffer") }
        }
    }
})

const SocketPingEvt = klass(Event, statics => {

    Object.defineProperties(statics, {
        NAME: { enumerable: true,
            value: "ping"
        }
    })

    return {
        constructor: function(e){
            Event.call(this, SocketPingEvt.NAME)
        }
    }
})

const SocketPongEvt = klass(Event, statics => {

    Object.defineProperties(statics, {
        NAME: { enumerable: true,
            value: "pong"
        }
    })

    return {
        constructor: function(e){
            Event.call(this, SocketPongEvt.NAME)
        }
    }
})

module.exports.WebSocket = klass(Node, statics => {
    /*
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
    //TODO: use better code for buffer manips :D...

    const sockets = new WeakMap

    Object.defineProperties(statics, {
        PONG_TIMEOUT: { enumerable: true,
            value: 5000
        }
    })

    const pong =  socket => {
        return new Promise(resolve => {
            const buffer = new Buffer(2)
            buffer.writeUInt16BE(0x8a00, 0) // "1000101000000000"

            socket.write(buffer, "binary", () => resolve)
        })
    }

    return {
        constructor: function(socket){
            if ( !(socket instanceof Socket) )
              throw new TypeError(errors.TODO)

            Node.call(this)
            sockets.set(this, new Map)
            sockets.get(this).set("uid", UID.uid())
            sockets.get(this).set("socket", socket)
            sockets.get(this).set("frame_buffer", [])

            this.socket.on("data", buffer => {
                //if ( VERBOSE ) console.log(`\n[${__filename}, pid: ${process.pid}] incoming message of ${buffer.length}bytes`)

                let view = buffer.readUInt8(0)
                const fin =  !!(view & 0x80)
                const rsv1 = view & 0x40
                const rsv2 = view & 0x20
                const rsv3 = view & 0x10
                const opcode = view & 0xf

                view = buffer.readUInt8(1)
                const masked = !!(view & 0x80)
                const {length, mask, start} = function(){
                    const len = (view & 0x7f)
                    const length = len < 126 ? len
                                 : len == 126 ? buffer.readUInt16BE(2)
                                 : (buffer.readUInt32BE(2) << 8) + buffer.readUInt32BE(6)


                    const mask = !masked ? 0
                               : len < 126 ? buffer.slice(2,6)
                               : len == 126 ? buffer.slice(4, 8)
                               : buffer.slice(10,14)
                    const start = len < 126 && masked ? 6
                                : len < 126 && !masked ? 2
                                : len == 126 && masked ? 8
                                : len == 126 && !masked ? 4
                                : masked ? 14
                                : 10
                    return { length, mask, start }
                }()

                if ( opcode == 10   ) { //todo pong
                    this.dispatchEvent(new SocketPongEvt)
                }
                else if ( opcode == 9 ) { //TODO ping
                    nextTick(() => pong(this.socket))
                }
                else if ( opcode == 8 ) { //TODO close

                }
                else {
                    const socketMessageEvt = new SocketMessageEvt({ buffer, fin, rsv1, rsv2, rsv3, opcode, masked, length, start, mask })
                    Event.keepAlive(socketMessageEvt)
                    this.dispatchEvent(socketMessageEvt)


                    //store the unmasked payload in the frame_buffer
                    sockets.get(this).get("frame_buffer").push(function(){
                        const view = buffer.slice(start)
                        const decoded = []

                        for ( let [i, v] of view.entries() )
                          decoded.push(v ^ mask[i%4])
                        return Buffer.from(decoded)
                    }.call(this))

                    // if fin, recompose the full message and send events
                    if ( !!fin ) {
                        const parts = []
                        while ( sockets.get(this).get("frame_buffer").length )
                          parts.push(sockets.get(this).get("frame_buffer").shift())

                        const full = Buffer.concat(parts)

                        switch ( socketMessageEvt.op ) {
                            case "text":
                              this.dispatchEvent(new SocketTextMessageEvt({ buffer:full, fin, rsv1, rsv2, rsv3, opcode, masked:false, length:full.length, start:0, mask:null  }))
                              break
                            case "binary":
                              this.dispatchEvent(new SocketBinaryMessageEvt({ buffer:full, fin, rsv1, rsv2, rsv3, opcode, masked:false, length:full.length, start:0, mask:null  }))
                              break
                            default:
                              return
                        }
                    }

                    Event.destroy(socketMessageEvt)
                }
            })

            let close = false
            const onend = () => {
                close = true
                this.dispatchEvent("close")
            }

            this.socket.on("end", onend)
            this.socket.on("close", onend)
            this.socket.on("timeout", onend)


            const pingpong = () => {
                if ( close )
                  return

                const op =  this.ping()
                op.catch(e => this.close())
                op.then(() => {
                    setTimeout(pingpong, 25000)
                })
            }
            setTimeout(pingpong, 1000)
        }
      , close: { enumerable: true,
            value: function(){
                if ( sockets.has(this) && !sockets.get(this).socket.destroyed )
                  sockets.get(this).unref() //TODO ?
            }
        }
      , message: { enumerable: true,
            value: function(){ // TODO
                return this.frame_text.apply(this, arguments)
            }
        }
      , send: { enumerable: true,
            value: function(){ //TODO
                return this.frame_text.apply(this, arguments)
            }
        }
      , frame_binary: { enumerable: true, //TODO TEST
            //value: function(msg, {fin, mask:masked}={ fin:true }){
            value: function(...args){
                const cb = typeOf(args[args.length-1]) == "function" ? args.pop() : Function.prototype
                const dict = typeOf(args[args.length-1]) == "object" ? args.pop() : {}
                const msg = !!args[0] || Object.prototype.toString(args[0])

                const fin = typeOf(dict.fin) == "boolean" ? dict.fin : true
                const masked = !!dict.mask || !!dict.masked
                const file = !!dict.file

                return new Promise((resolve, reject) => {
                    const onerror = e => { cb(e); reject(e) }

                    if ( file && typeOf(args[0]) == "string" ) {
                        fs.readFile(args.shift(), (err, data) => {
                            if ( err )
                              return onerror(err)
                            resolve(data)
                        })
                    } else if ( args[0] instanceof Buffer )
                      resolve(args.shift())
                    else {
                        try {
                            const buffer = Buffer.from(args.shift())
                        } catch(e) {
                            onerror(e)
                            reject(e)
                        }
                    }
                }).then(msg=>{
                    return new Promise((resolve, reject) => {
                        const onerror = e => { cb(e); reject(e) }

                        const payload = Buffer.from(msg)
                        const header = Buffer.alloc(2)
                        const {len, length} = function(){
                            const len = payload.length < 0x7e ? payload.length
                                      : payload.length <= 0xffff ? 0x7e
                                      : 0x7f
                            const length = len < 0x7e ? Buffer.alloc(0)
                                         : len == 0x7e ? function(buffer){ buffer.writeUInt16BE(payload.length); return buffer }(Buffer.alloc(2))
                                         :  function(buffer){ //TODO TEST!, find a pretttier way?
                                                const bin = payload.length.toString(2).split("")
                                                buffer.writeUInt32BE(parseInt(bin.splice(-32).join("")||"0", 2), 4)
                                                buffer.writeUInt32BE(parseInt(bin.splice(-32).join("")||"0", 2), 0)
                                                return buffer
                                            }(Buffer.alloc(8))

                            return { len, length }
                        }()
                        const mask = !!masked ? Buffer.from( new Uint32Array(4).fill(0) ) : Buffer.alloc(0) //TODO add mask
                        header[0] = 0x0 |(fin?0x80:0) | 0x2
                        header[1] = 0x0 |(masked?0x80:0) | len

                        const frame = Buffer.concat([header, length, mask, payload])

                        this.socket.write(frame, "binary", resolve)
                    })
                })
            }
        }
      , frame_text: { enumerable: true,
            //value: function(msg, {fin, mask:masked, stringify}={ fin:true }){
            value: function(...args){
                const cb = typeOf(args[args.length-1]) == "function" ? args.pop() : Function.prototype
                const dict = typeOf(args[args.length-1]) == "object" ? args.pop() : {}

                const fin = typeOf(dict.fin) == "boolean" ? dict.fin : true
                const masked = !!dict.mask || !!dict.masked
                const stringify = !!dict.stringify

                return new Promise((resolve, reject) => {
                    const onerror = e => { cb(e); reject(e) }

                    let msg
                    try {
                         msg = typeOf(args[0]) == "string" ? args.shift()
                             : !!stringify ? JSON.stringify(args.shift())
                             : void function(){ throw new TypeError(errors.TODO) }()
                    } catch(e){ return onerror(e)  }

                    const payload = Buffer.from(msg)
                    const header = Buffer.alloc(2)
                    const {len, length} = function(){
                        const len = payload.length < 0x7e ? payload.length
                                  : payload.length <= 0xffff ? 0x7e
                                  : 0x7f
                        const length = len < 0x7e ? Buffer.alloc(0)
                                     : len == 0x7e ? function(buffer){ buffer.writeUInt16BE(payload.length); return buffer }(Buffer.alloc(2))
                                     :  function(buffer){ //TODO TEST!, find a pretttier way?
                                            const bin = payload.length.toString(2).split("")
                                            buffer.writeUInt32BE(parseInt(bin.splice(-32).join("")||"0", 2), 4)
                                            buffer.writeUInt32BE(parseInt(bin.splice(-32).join("")||"0", 2), 0)
                                            return buffer
                                        }(Buffer.alloc(8))

                        return { len, length }
                    }()
                    const mask = !!masked ? Buffer.from( new Uint32Array(4).fill(0) ) : Buffer.alloc(0) //TODO add mask
                    header[0] = 0x0 |(fin?0x80:0) | 0x1
                    header[1] = 0x0 |(masked?0x80:0) | len

                    const frame = Buffer.concat([header, length, mask, payload])

                    this.socket.write(frame, "binary", resolve)
                })
            }
        }
      , ping: { enumerable: true,
            value: function(){
                //TODO, no need to recreate the msg everytime ?
                return new Promise((resolve, reject) => {
                    const buffer = new Buffer(2)
                    buffer.writeUInt16BE(0x8900, 0)

                    const timeout = setTimeout(() => {
                        this.removeEventListener("pong", onpong, true)
                        //TODO ?
                        reject()
                    }, module.exports.WebSocket.PONG_TIMEOUT)

                    const onpong = e => {
                        clearTimeout(timeout)
                        this.removeEventListener("pong", onpong, true)
                        resolve()
                    }
                    this.addEventListener("pong", onpong, true)

                    this.dispatchEvent("ping")
                    this.socket.write( buffer, "binary" )
                })
            }
        }
      , uid: { enumerable: true,
            get: function(){ return sockets.get(this).get("uid") }
        }
      , socket: { enumerable: true,
            get: function(){ return sockets.get(this).get("socket") }
        }
    }
})

module.exports.WebSocketUpgrade = klass(Node, statics => {
    const upgrades = new WeakMap()
    const magic_uuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

    return {
        constructor: function(server, protocols){
            Node.call(this)
            upgrades.set(this, new Map)
            upgrades.get(this).set("sockets", new Set)
            upgrades.get(this).set("protocols", typeOf(protocols) == "array" ? protocols.filter(p=>typeOf(p)=="string")
                                 : typeOf(protocols) == "string" ? [protocols]
                                 : "*")

            if ( !Server.isImplementedBy(server) && !SecureServer.isImplementedBy(server) )
              throw new TypeError(errors.TODO)
            upgrades.get(this).set("server", server)

            const onlisten = e => {
                if ( !!e )
                  server.removeListener("listening", onlisten)

                // upgrades.get(this).server.on("secureConnection", socket => {
                //     socket.on("data", data => { console.log("secureconnection?", data.toString()) })
                // })

                upgrades.get(this).get("server").on("upgrade", ({headers}, socket, head) => {
                    //console.log("UPG", headers)
                    const shasum = crypto.createHash("sha1")
                    shasum.update(headers["sec-websocket-key"] + magic_uuid, 'binary')
                    const hash = shasum.digest("base64")
                    const protocol = !!headers["sec-websocket-protocol"]
                                    ? headers["sec-websocket-protocol"].split(",")
                                        .filter(p => {
                                            return upgrades.get(this).get("protocols") === "*"
                                                 ? true
                                                 : upgrades.get(this).get("protocols").indexOf(p.trim()) !== -1
                                        })[0]
                                    : null
                    const response = []

                    // TODO define how to validate the upgrade or not
                    const connect = headers["sec-websocket-protocol"] && !protocol ? false
                                  : true
                    if ( connect ) {
                        response.push(`HTTP/1.1 101 Switching Protocols`)
                        response.push(`Upgrade: websocket`)
                        response.push(`Connection: ${headers["connection"]}`)
                        response.push(`Sec-WebSocket-Accept: ${hash}`)
                        if ( protocol )
                          response.push(`Sec-WebSocket-Protocol: ${protocol}`)
                    } else {
                        response.push(`403 Forbidden`)
                    }

                    // add two empty lines as per rfc
                    response.push(``)
                    response.push(``)

                    if ( headers["connection"].indexOf("keep-alive") != -1 )
                        socket.setKeepAlive(true, 0)
                    socket.write(response.join('\r\n'))

                    const _socket = new module.exports.WebSocket(socket)
                    upgrades.get(this).get("sockets").add(_socket)
                    _socket.addEventListener("close", e => {
                        upgrades.get(this).get("sockets").delete(_socket)
                    }, true)

                    this.dispatchEvent(new module.exports.SocketEvt(_socket))
                })
            }

            if ( server.listening ) onlisten()
            else server.addListener("listening", onlisten)
        }
      , sockets: { enumerable: true,
            get: function(){
                return [...upgrades.get(this).get("sockets").values()]
            }
        }
    }
})
