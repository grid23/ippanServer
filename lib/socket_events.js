"use strict"

const { DEBUG, VERBOSE } = require("./env")

const { class:klass } = require("ippankiban/lib/class")
const errors = require("./errors")

const { Event, _eventWM:events } = require("ippankiban/lib/Event")

module.exports.SocketConnexion = klass(Event, statics => {
    Object.defineProperties(statics, {
        TYPE: { enumerable: true,
            value: "socket"
        }
    })

    return {
        constructor: function(socket){
            Event.call(this, module.exports.SocketConnexion.TYPE)
            events.get(this).set("socket", socket)
        }
      , socket: {  enumerable: true,
            get: function(){ return events.get(this).get("socket") }
        }
    }
})

module.exports.SocketMessage = klass(Event, statics => {
    Object.defineProperties(statics, {
        [0b1]: { enumerable: true, value: "text" }
      , text: { enumerable: true, value: 0b1 }
      , [0b10]: { enumerable: true, value: "binary" }
      , binary: { enumerable: true, value: 0b10 }
      , [0b1000]: { enumerable: true, value: "close" }
      , close: { enumerable: true, value: 0b1000 }
      , [0b1001]: { enumerable: true, value: "ping" }
      , ping: { enumerable: true, value: 0b1001 }
      , [0b1010]: { enumerable: true, value: "pong" }
      , pong: { enumerable: true, value: 0b1010 }

      , TYPE: { enumerable: true, value: "message" }
    })

    const unmask = (message) => function(){ // lexically bound to the message object

        if ( !events.get(this).get("masked") )
          return Buffer.from(this.payload)

        const decoded = []

        for ( let [i, v] of this.payload.entries() )
          decoded.push(v ^ this.mask[i%4])


        if ( this.opcode == module.exports.SocketMessage.text )
          return Buffer.from(decoded).toString()
        return Buffer.from(decoded)
    }.bind(message)

    return {
        constructor: function(buffer){
            Event.call(this, module.exports.SocketMessage.TYPE)

            events.get(this).set("buffer", buffer)
            let view = this.buffer.readUInt8(0)
            events.get(this).set("fin", !!(view & 0x80))
            events.get(this).set("rsv1", view & 0x40)
            events.get(this).set("rsv2", view & 0x20)
            events.get(this).set("rsv3", view & 0x10)
            events.get(this).set("opcode", view & 0xf)
            events.get(this).set("op", module.exports.SocketMessage[this.opcode])

            view = this.buffer.readUInt8(1)
            events.get(this).set("masked", !!(view & 0x80))
            const len = (view & 0x7f)
            events.get(this).set("length", len < 126 ? len
                                         : len == 126 ? this.buffer.readUInt16BE(2)
                                         : (this.buffer.readUInt32BE(2) << 8) + this.buffer.readUInt32BE(6))
            events.get(this).set("start", len < 126 && this.masked ? 6
                                        : len < 126 && !this.masked ? 2
                                        : len == 126 && this.masked ? 8
                                        : len == 126 && !this.masked ? 4
                                        : this.masked ? 14
                                        : 10)
            events.get(this).set("mask", !this.masked ? 0
                                       : len < 126 ? this.buffer.slice(2,6)
                                       : len == 126 ? this.buffer.slice(4, 8)
                                       : this.buffer.slice(10,14))
            events.get(this).set("unmask", unmask(this))
        }
      , buffer: { enumerable: true,
            get: function(){ return events.get(this).get("buffer") }
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
                return events.get(this).get("buffer").slice(events.get(this).get("start"))
            }
        }
      , unmask: { enumerable: true, configurable: true,
            get: function(){ return events.get(this).get("unmask") }
        }
    }
})

module.exports.SocketTextMessage = klass(module.exports.SocketMessage, statics => {
    Object.defineProperties(statics, {
        TYPE: { enumerable: true, value: "textframe" }
    })

    return {
        constructor: function(...args){
            Reflect.apply(module.exports.SocketMessage, this, args)
        }
    }
})

module.exports.SocketBinaryMessage = klass(module.exports.SocketMessage, statics => {
    Object.defineProperties(statics, {
        TYPE: { enumerable: true, value: "binaryframe" }
    })

    return {
        constructor: function(...args){
            Reflect.apply(module.exports.SocketMessage, this, args)
        }
    }
})
