"use strict"

const errors = require("./errors")
const eventWM = require("../lib/Event")._eventWM
const klass = require("../lib/class").class
const routeWM = require("../lib/Route")._routeWM

const Event = require("../lib/Event").Event
const Node = require("../lib/Node").Node
const Route = require("../lib/Route").Route
const Router = require("../lib/Router").Router
const Server = require("./Server").Server
const WebSocketUpgrade = require("./WebSocketUpgrade").WebSocketUpgrade


const SocketCommand = klass(Route, statics => {
    const routes = routeWM

    return {
        constructor: function(socket, cmd, request){
            Route.call(this, cmd, { request })
            routes.get(this).socket = socket
        }
      , socket: { enumerable: true,
            get: function(){ return routes.get(this).socket }
        }
    }
})

module.exports.SignalingUpgrade = klass(Router, WebSocketUpgrade, statics => {
    const upgrades = new WeakMap

    return {
        constructor: function(server){
            WebSocketUpgrade.call(this, server)
            Router.call(this)

            this.addEventListener("socket", ({socket}) => {
                socket.addEventListener("ping", e => console.log("ping"))
                socket.addEventListener("pong", e => console.log("pong"))
                socket.addEventListener("close", e => console.log("close"))

                socket.addEventListener("text", e => {
                    let payload = e.unmask()
                    try { payload = JSON.parse(payload) }
                    catch(e){ return console.error(e) } //TODO

                    const { cmd, data } = payload
                    this.dispatchRoute(new SocketCommand(socket, cmd, data))
                })
            })

            this.addRouteHandler("/signal/answer", ({socket, path:cmd, request:{peer:id, answer}}, next) => {
                const peer = this.sockets.filter(s => s.uid === id )[0]

                if ( peer ) peer.frame_text( JSON.stringify({
                    cmd
                  , data: { id: socket.uid, answer }
                }) )
            })

            this.addRouteHandler("/signal/icecandidate", ({socket, path:cmd, request:{peer:id, candidate}}, next) => {
                const peer = this.sockets.filter(s => s.uid === id )[0]

                if ( peer ) peer.frame_text( JSON.stringify({
                    cmd
                  , data: { id: socket.uid, candidate }
                }) )
            })

            this.addRouteHandler("/signal/list", ({socket, path:cmd, request}, next) => {
                const data = this.sockets.filter(s => s !== socket ).map(s => s.uid)

                socket.frame_text( JSON.stringify({cmd, data}) )
            })

            this.addRouteHandler("/signal/offer", ({socket, path:cmd, request:{peer:id, offer}}, next) => {
                const peer = this.sockets.filter(s => s.uid === id )[0]

                if ( peer ) peer.frame_text( JSON.stringify({
                    cmd
                  , data: { id: socket.uid, offer }
                }) )
            })
        }
    }
})
