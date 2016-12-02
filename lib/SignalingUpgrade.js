"use strict"

const errors = require("./errors")
const eventWM = require("ippankiban/lib/Event")._eventWM
const klass = require("ippankiban/lib/class").class
const routeWM = require("ippankiban/lib/Route")._routeWM
const typeOf = require("ippankiban/lib/type").typeOf

const Event = require("ippankiban/lib/Event").Event
const Node = require("ippankiban/lib/Node").Node
const Route = require("ippankiban/lib/Route").Route
const Router = require("ippankiban/lib/Router").Router
const Server = require("./Server").Server
const WebSocketUpgrade = require("./WebSocketUpgrade").WebSocketUpgrade

const SignalResponse = klass(statics => {
    const responses = new WeakMap

    return {
        constructor: function(cmd, from, to, data){
            responses.set(this, new Map)
            responses.get(this).set("replied", false)
            responses.get(this).set("cmd", cmd)
            responses.get(this).set("from", !!to ? from : null) // if no target, target is emitter
            responses.get(this).set("to", to || from) // if no target, target is emitter
            responses.get(this).set("data", data)
        }
      , cmd: { enumerable: true,
            get: function(){ return responses.get(this).get("cmd") }
          , set: function(v){ responses.get(this).set("cmd", cmd) }
        }
      , data: { enumerable: true,
            get: function(){ return responses.get(this).get("data") }
          , set: function(v){ responses.get(this).set("data", data) }
        }
      , send: { enumerable: true,
            value: function(data){
                if ( !!responses.get(this).get("replied") )
                  console.warn("a reply has already been sent")
                else
                  responses.get(this).set("replied", true)

                const msg = {
                    cmd: this.cmd
                  , data: data || this.data
                }

                if ( responses.get(this).get("from") )
                  msg["peer"] = responses.get(this).get("from").uid

                return responses.get(this).get("to").frame_text(msg, { stringify: true })
            }
        }
    }
})

const CatchAllSocketCommand = klass(Route, statics => {
    const routes = routeWM

    return {
        constructor: function(upgrade, socket, cmd, peer, payload){
            const response = new SignalResponse(cmd, socket, peer, payload)
            Route.call(this, "catchall", { request:payload, response })
            routes.get(this).set("cmd", cmd)
            routes.get(this).set("peer", peer)
            routes.get(this).set("socket", socket)
        }
      , cmd: { enumerable: true,
            get: function(){ return routes.get(this).get("cmd") }
        }
      , peer: { enumerable: true,
            get: function(){ return routes.get(this).get("peer") }
        }
      , socket: { enumerable: true,
            get: function(){ return routes.get(this).get("socket") }
        }

    }
})

const SocketCommand = klass(Route, statics => {
    const routes = routeWM

    return {
        constructor: function(upgrade, socket, cmd, peer, payload){
            const response = new SignalResponse(cmd, socket, peer, payload)
            Route.call(this, cmd, { request:payload, response })
            routes.get(this).set("peer", peer)
            routes.get(this).set("socket", socket)
        }
      , cmd: { enumerable: true,
            get: function(){ return this.path }
        }
      , peer: { enumerable: true,
            get: function(){ return routes.get(this).get("peer") }
        }
      , socket: { enumerable: true,
            get: function(){ return routes.get(this).get("socket") }
        }

    }
})

const SignalEvent = module.exports.SignalEvent = klass(Event, statics => {
    const events = eventWM

    return {
        constructor: function(cmd, from, to, payload, response){
            Event.call(this, "signal")
            events.get(this).set("cmd", cmd)
            events.get(this).set("from", from)
            events.get(this).set("to", to)
            events.get(this).set("payload", payload)
            events.get(this).set("response", response)
        }
      , cmd: { enumerable: true,
            get: function(){ return events.get(this).get("cmd") }
        }
      , from: { enumerable: true,
            get: function(){ return events.get(this).get("from") }
        }
      , payload: { enumerable: true,
            get: function(){ return events.get(this).get("payload") }
        }
      , send: { enumerable: true,
            value: function(data){
                return events.get(this).get("response").send(data)
            }
        }
      , to: { enumerable: true,
            get: function(){ return events.get(this).get("to") }
        }
    }
})

const AnswerEvent = klass(SignalEvent, statics => {

    return {
        constructor: function(from, to, payload, response){
            SignalEvent.call(this, "answer", from, to, payload, response)
        }
    }
})

const ErrorEvent = klass(SignalEvent, statics => {

    return {
        constructor: function(from, to, payload, response){
            SignalEvent.call(this, "error", from, to, payload, response)
        }
    }
})

const ICECandidateEvent = klass(SignalEvent, statics => {

    return {
        constructor: function(from, to, payload, response){
            SignalEvent.call(this, "icecandidate", from, to, payload, response)
        }
    }
})

const OfferEvent = klass(SignalEvent, statics => {

    return {
        constructor: function(from, to, payload, response){
            SignalEvent.call(this, "offer", from, to, payload, response)
        }
    }
})

module.exports.SignalingUpgrade = klass(Router, WebSocketUpgrade, statics => {
    const upgrades = new WeakMap

    return {
        constructor: function(server){
            WebSocketUpgrade.call(this, server)
            Router.call(this)

            upgrades.set(this, new Map)
            upgrades.get(this).set("uuids", new Map)

            this.addEventListener("socket", ({socket}) => {
                upgrades.get(this).get("uuids").set(socket.uid, socket) // maintain a list of socket by UID
                socket.addEventListener("close", e => upgrades.get(this).get("uuids").delete(socket.uid))

                socket.addEventListener("message", e => {
                    if ( e.op == "pong" )
                      return

                    e.preventDefault() //prevent derived events from firing

                    if ( e.op !== "text" )
                      return // ignore all but text frame

                    try {
                        let { cmd, data, peer } = JSON.parse( e.unmask() )

                        if ( !cmd )
                          throw new Error("no command")

                        if ( !!peer && this.uuids.indexOf(peer) != -1 )
                          peer = upgrades.get(this).get("uuids").get(peer)
                        else
                          peer = null

                        data = data || {}

                        this.dispatchRoute( new SocketCommand(this, socket, cmd, peer, data ) )
                          .addEventListener("routing", ({count}) => {
                              if ( !count )
                                this.dispatchRoute( new CatchAllSocketCommand(this, socket, cmd, peer, data))
                          })
                    } catch(err){
                        const cmd = "error"
                        const data = { error: err.message, originalMessage: e.unmask() }
                        const peer = null
                        this.dispatchRoute( new SocketCommand(this, socket, cmd, peer, data ) )
                    }
                })
            })

            this.addRouteHandler("answer", ({socket, peer, cmd, request, response}, next) => {
                const event = new AnswerEvent(socket, peer, request, response)
                this.dispatchEvent(event)
                if ( !event.cancelled )
                  response.send()
            })

            this.addEventListener("error", e => {
                console.warn(e.message)
                //prevent error from throwing
            }, true)
            this.addRouteHandler("error", ({socket, peer, cmd, request, response}, next) => {
                const event = new ErrorEvent(socket, peer, request, response)
                this.dispatchEvent(event)
                if ( !event.cancelled )
                  response.send()
            })
            this.addRouteHandler("icecandidate", ({socket, peer, cmd, request, response}, next) => {
                const event = new ICECandidateEvent(socket, peer, request, response)
                this.dispatchEvent(event)
                if ( !event.cancelled )
                  response.send()
            })
            this.addRouteHandler("offer", ({socket, peer, cmd, request, response}, next) => {
                const event = new OfferEvent(socket, peer, request, response)
                this.dispatchEvent(event)
                if ( !event.cancelled )
                  response.send()
            })
            this.addRouteHandler("catchall", ({socket, peer, cmd, request, response}, next) => {
                const event = new SignalEvent(cmd, socket, peer, request, response)
                this.dispatchEvent(event)
            })
        }
      , uuids: { enumerable: true,
            get: function(){
                return [...upgrades.get(this).get("uuids").keys()]
            }
        }
    }
})
