"use strict"

const { ERR_NOT_A_STRING, ERR_NOT_A_FUNCTION } = require("./errors")

const { class:klass } = require("ippankiban/lib/class")
const { typeOf } = require("ippankiban/lib/type")
const { UID: { uid }} = require("ippankiban/lib/UID")

const { Event, _eventWM:events } = require("ippankiban/lib/Event")
const { Node } = require("ippankiban/lib/Node")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")

module.exports._taskWM = new WeakMap

module.exports.ErrorEvt = klass(Event, statics => {

    return {
        constructor: function(error){
            Event.call(this, "error", error)
        }
    }
})

module.exports.RejectEvt = klass(Event, statics => {

    return {
        constructor: function(detail){
            Event.call(this, "reject", detail)
        }
    }
})

module.exports.ResolveEvt = klass(Event, statics => {

    return {
        constructor: function(detail){
            Event.call(this, "resolve", detail)
        }
    }
})

module.exports.MessageEvt = klass(Event, statics => {

    return {
        constructor: function(detail){
            Event.call(this, "message", detail)
        }
    }
})

module.exports.StartEvt = klass(Event, statics => {

    return {
        constructor: function(detail){
            Event.call(this, "start", detail)
        }
    }
})

module.exports.PhantomTask = klass(Node, ReadyStateFul, statics => {
    const tasks = module.exports._taskWM

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , [0b0]: { enumerable: true, value: "UNINITIALIZED"}
      , INITIALIZED: { enumerable: true, value: 0b1 }
      , [0b1]: { enumerable: true, value: "INITIALIZED" }
      , RUNNING: { enumerable: true, value: 0b10 }
      , [0b10]: { enumerable: true, value: "RUNNING" }
      , COMPLETED: { enumerable: true, value: 0b11 }
      , [0b11]: { enumerable: true, value: "COMPLETED" }

      , Exec: { enumerable: true,
            get: () => module.exports.PhantomTaskExec
        }
    })

    return {
        tid: { enumerable: true, configurable: true, value: 0b0 }
      , constructor: function(){
            Node.call(this)
            tasks.set(this, new Map)
            tasks.get(this).set("id", uid())
            tasks.get(this).set("args", [])
        }
      , id: { enumerable: true,
            get: function(){
                return tasks.get(this).get("id")
            }
        }
      , query: { enumerable: true,
            get: function(){
                return tasks.get(this).get("args")
            }
        }
    }
})

module.exports.PhantomTaskExec = klass(module.exports.PhantomTask, statics => {
    const tasks = module.exports._taskWM

    return {
        tid: { enumerable: true, value: 0b1 }
      , constructor: function({ exec, handler } = {}){
            module.exports.PhantomTask.call(this)

            exec = typeOf(exec) == "function" ? exec.toString()
                 : typeOf(handler) == "function" ? handler.toString()
                 : void function exec_error(){ throw new Error(ERR_NOT_A_FUNCTION) }()

            tasks.get(this).get("args").push(exec)
        }
    }
})
