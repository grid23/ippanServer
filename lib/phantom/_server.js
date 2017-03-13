"use strict"

var system = require("system")
var webserver = require("webserver")
var webpage = require("webpage")

var server = webserver.create()
var page = webpage.create()

var args = Array.prototype.slice.call(system.args, 1)
var port = +( args.shift() )
var keepAlive = !!( args.shift() )
var parent = args.shift()
var parameters = args.shift()

function createDetail(args){
    args = Array.prototype.slice.call(arguments)

    switch ( args.length ) {
        case 0:
            return null
        case 1:
            return args[0]
        default:
            return args
    }
}

var service = server.listen(port, { keepAlive: keepAlive }, function(request, response, data, task, handler, message, resolve){
    data = request.post && request.post.constructor === Object ? request.post : {}

    if ( data.id !== parent ) {
        response.statusCode = 400
        response.setHeader("Content-Type", "application/json")
        response.write({ status: "error" })
        return response.close()
    }

    task = data.task

    message = function(rv){
        system.stdout.write(JSON.stringify({
            event: ["task:message:", task].join("")
          , detail: rv
        }))
    }

    resolve = function(rrv, rv){
        try {
            rv = JSON.parse(rrv)
        } catch(e) { rv = rrv }

        system.stdout.write(JSON.stringify({
            event: ["task:end:", task].join("")
          , detail: rv
        }))
    }

    response.setHeader("Content-Type", "application/json")
    response.statusCode = 200
    response.write("{status: ok}")
    response.close()

    try {
        handler = new Function("page", "resolve", "message", "parameters", [ "return ", data.handler, "(page, resolve, message, parameters)" ].join(""))
        system.stdout.write(JSON.stringify({
            event: ["task:start:", task].join("")
          , detail: {}
        }))
        handler(page, resolve, message, parameters)
    } catch(e) {
        system.stdout.write(JSON.stringify({
            event: ["task:error:", task].join("")
          , detail: {
                error: e.message
            }
        }))
    }
})

if ( service )
  system.stdout.write(JSON.stringify({ "event": "server:start:listening" }))
else
  system.stdout.write(JSON.stringify({ "event": "server:start:error" })),
  phantom.exit()
