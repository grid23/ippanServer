"use strict"

var system = require("system")
var page = require("webpage").create()

var config = function(args){
    return {
        port: args.shift()
      , debug: !!+(args.shift())
    }
}( Array.prototype.slice.call(system.args, 1) )

var error = function(e){
    system.stderr.write(e && e.message ? e.message: "error")
}
var exit = function(code){
    return setTimeout(function(){
        phantom.exit(code)
    }, 4)
}

var resolve = function(v){
    socket.send(json.stringify({
        event: "resolve"
      , target: this.id
      , detail: v
    }))
}

var reject = function(id, e){
    socket.send(json.stringify({
        event: "reject"
      , target: this.id
      , detail: e
    }))
}

var message = function(id, v){
    socket.send(json.stringify({
        event: "message"
      , target: this.id
      , detail: v
    }))
}

var Task = function(id){
    Object.defineProperty(this, "_id", { enumerable: false, value: id })
}
Task.prototype = Object.create({}, {
    exec: { enumerable: true,
        get: function(){ return this._exec }
      , set: function(v){ Object.defineProperty(this, "_exec", { value: v }) }
    }
  , id: { enumerable: true,
        get: function(){ return this._id }
    }
})
Object.defineProperties(Task, {
    1: { enumerable: true,
        get: function(){ return TaskExec }
    }
})

var TaskExec = function(id, query){
    Task.call(this, id)
    if ( config.debug )
      console.log("[phantomjs2 sandbox] starting Exec task")
    var local_resolve = resolve.bind(this)
    var local_reject = reject.bind(this)
    var local_message = message.bind(this)

    try {
        this.exec = new Function("system", "page", "message", "resolve", "reject", ["return ", query.shift(), "(system, page, local_message, local_resolve, local_reject)"].join(""))
    } catch(e){
      error(e)
    }

}
TaskExec.prototype = Object.create(Task.prototype)

var onwsmessage = function(e){
  if ( config.debug )
    console.log("[phantomjs2 sandbox], incoming message", e.data)

  var msg = JSON.parse(e.data) || {}

  var event = msg.event
  var target = msg.target
  var type = msg.type
  var query = msg.detail || {}

  if ( event === "task" ) {
      if ( type > 0 && typeof Task[type] == "function" )
        new Task[type](target, query)
      else
        system.stderr.write("no corresponding task " + type)
  }
  else if ( event === "exit" ) {
      exit(0)
  }

}

var onwsopen = function(e){
    if ( config.debug )
      console.log("[phantomjs2 sandbox] websocket opened")
    socket.removeEventListener("open", onwsopen)

    socket.send(JSON.stringify({
        event: "ready"
    }))
}

var socket = new WebSocket("ws://localhost:" + config.port)
socket.addEventListener("open", onwsopen)
socket.addEventListener("message", onwsmessage)
