"use strict"

const errors = require("./errors")
const fs = require("fs")
const https = require("https")
const inherits = require("util").inherits
const klass = require("ippankiban/lib/class").class
const objectify = require("ippankiban/lib/Serializer").Serializer.objectify
const parse = require("url").parse
const path = require("path")
const tls = require("tls")
const typeOf = require("ippankiban/lib/type").typeOf

const Event = require("ippankiban/lib/Event").Event
const Route = require("ippankiban/lib/Route").Route
const Router = require("ippankiban/lib/Router").Router
const Server = require("./Server").Server

module.exports.SecureServer = klass(Router, /* via util.inherits: https.Server, tls.Server */ statics => {
    const servers = new WeakMap

    Object.defineProperties(statics, {
        Route: { enumerable: true,
            get: function(){ return Server.Route
            }
        }
      , CatchAllRoute: { enumerable: true,
            get: function(){ return Server.CatchAllRoute }
        }
    })

    return {
        constructor: function({key, crt, ca} = {}){
            servers.set(this, new Map)
            Router.apply(this, arguments)
            this.Route = module.exports.SecureServer.Route // from Router

            servers.get(this).set("secure", true)
            servers.get(this).set("key", fs.readFileSync(key))
            servers.get(this).set("cert", fs.readFileSync(crt))
            servers.get(this).set("ca", fs.readFileSync(ca))

            https.Server.call(this, this.options)

            this.on("request", (request, response) => {
                this.dispatchRoute(new this.Route(request, response))
                  .addEventListener("routing", e => {
                      if ( !e.count )
                        this.dispatchRoute(new this.CatchAllRoute(request, response))
                          .addEventListener("routing", e => {
                              if ( !e.count )
                                response.writeHead("404"),
                                response.end()
                          })
                  })
            })
        }
      , CatchAllRoute: { enumerable: true, configurable: true,
            get: function(){ return servers.get(this).get("CatchAllRoute") || module.exports.Server.CatchAllRoute }
          , set: function(v){
                if ( Route.isImplementedBy(v) && typeOf(v) == "function" )
                  servers.get(this).set("CatchAllRoute", v)
            }
        }
      , options: { enumerable: true,
            get: function(opts){
                opts = { // TODO
                    requestCert: true
                  , rejectUnauthorized: false
                }

                opts.key = this.ssl_key
                opts.cert = this.ssl_cert
                opts.ca = this.ssl_ca

                return opts
            }
        }
      , secure: { enumerable: true,
            get: function(){ return !!servers.get(this).get("secure") }
        }
      , ssl_key: { enumerable: true,
            get: function(){ return servers.get(this).get("key") }
        }
      , ssl_cert: { enumerable: true,
            get: function(){ return servers.get(this).get("cert") }
        }
      , ssl_ca: { enumerable: true,
            get: function(){ return  servers.get(this).get("ca") }
        }
    }
})

inherits(module.exports.SecureServer, tls.Server)
inherits(module.exports.SecureServer, https.Server)
