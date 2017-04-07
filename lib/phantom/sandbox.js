"use strict"

var system = require("system")
var page = require("webpage").create()
var fs = require("fs")

var config = function(args){
    return {
        port: args.shift()
      , debug: !!+(args.shift())
      , data: function(data){
            try {
                return JSON.parse(data)
            } catch(e) {
                return data
            }
        }(args.shift())
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

var queue = []
var queueLoop = function loop(){
    if ( queue.length ) {
        var handler = queue.shift()
        handler()
    }
    setTimeout(loop, 100)
}()

var send = function(event, target, detail){
    queue.push(function(){
        socket.send(JSON.stringify({
            event: event
          , target: target
          , detail: detail
        }))
    })
}

var reject = function reject(e){
    if ( config.debug )
      console.log("task ", this.id, " => reject()")

    send("reject", this.id, (e && e.message) ? e.message : "error")
}

var resolve = function resolve(v){
  if ( config.debug )
    console.log("task ", this.id, " => resolve()")

    var path = ["/tmp/", this.id].join("")
    fs.write(path, JSON.stringify(v), 'w')

    send("resolve", this.id, {  __file: path })
}


var message = function message(v){
    if ( config.debug )
      console.log("task ", this.id, " => message()")

    send("message", this.id, v)
}

var start = function start(v){
    if ( config.debug )
      console.log("task ", this.id, " => start()")

    send("start", this.id, v||null)
}

var Task = function(id){
    Object.defineProperty(this, "_id", { enumerable: false, value: id })
}
Task.prototype = Object.create({}, {
    execfn: { enumerable: true,
        get: function(){ return this._execfn }
      , set: function(v){ Object.defineProperty(this, "_execfn", { value: v }) }
    }
  , id: { enumerable: true,
        get: function(){ return this._id }
    }
  , run: { enumerable: true,
        value: function(){
            if ( config.debug )
              console.log("task ", this.id, " => run()")

            try {
                start.call(this)

                this.execfn.call(this, system, page, message.bind(this), resolve.bind(this), reject.bind(this), config.data)
            } catch(e) {
              if ( config.debug )
                console.log("task ", this.id, " => error: ", e.message)

                reject.call(this, e)
            }
        }
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

    try {
        this.execfn = new Function("system", "page", "message", "resolve", "reject", "data", ["return ", query.shift(), "(system, page, message, resolve, reject, data)"].join("")).bind(this)
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
      if ( type > 0 && typeof Task[type] == "function" ) {
          new Task[type](target, query).run()
      } else system.stderr.write("no corresponding task " + type)
  }
  else if ( event === "exit" ) {
      exit(0)
  }
}

var onwsopen = function(e){
    if ( config.debug )
      console.log("[phantomjs2 sandbox] websocket opened")
    socket.removeEventListener("open", onwsopen)

    send("ready", null, null)
}

var socket = new WebSocket("ws://localhost:" + config.port)
socket.addEventListener("open", onwsopen)
socket.addEventListener("message", onwsmessage)
