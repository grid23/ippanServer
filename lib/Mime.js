"use strict"

const { ERR_NO_MIME } = require("./errors")
const klass = require("ippankiban/lib/class").class
const mimetypes = require("./mimetypes")
const path = require("path")
const typeOf = require("ippankiban/lib/type").typeOf

const Collection = require("ippankiban/lib/Collection").Collection
const Event = require("ippankiban/lib/Event").Event
const EventTarget = require("ippankiban/lib/EventTarget").EventTarget
const Model = require("ippankiban/lib/Model").Model

module.exports.Mime = klass(EventTarget, statics => {
    const mimes = new WeakMap
    const collection = new Collection

    mimetypes.forEach(([name, template, extension]) => {
        collection.addModel({name, template, extension})
    })

    Object.defineProperties(statics, {
        define: { enumerable: true,
            value: function(name, template, extension){
                collection.addModel({name, template, extension})
            }
        }
      , lookup: { enumerable: true,
            value: function(...args){
                const cb = typeOf(args[args.length-1]) == "function" ? args.pop() : ()=>{}
                const lookup = args.shift() || ""
                const extname = (path.extname(lookup).length ? path.extname(lookup) : lookup).slice(1)

                return new Promise((resolve, reject) => {
                    const subset = collection.subset({ extension: extname.toLowerCase() }, cb)
                    subset.addEventListener("subsetready", e => {
                        subset.list("template", (err, {template:templates}) => {
                            if ( !templates.length )
                              err = new Error(ERR_NO_MIME)

                            if ( err )
                              reject(err)
                            else
                              resolve({ templates })
                        })
                    })
                })
                .catch(e => {
                    return { error: e }
                })
                .then(({error=null, templates = []}) => {
                    cb.apply(null, [error, ...templates])

                    return templates
                })
            }
        }
      , reverse_lookup: { enumerable: true,
            value: function(...args){
                const cb = typeOf(args[args.length-1]) == "function" ? args.pop() : ()=>{}
                const lookup = args.shift()
                const template = lookup.split(";")[0]

                return new Promise((resolve, reject) => {
                    const subset = collection.subset({ template: template.toLowerCase() }, cb)
                    subset.addEventListener("subsetready", e => {
                        subset.list("extension", (err, {extension:extensions}) => {
                            if ( !extensions.length )
                              err = new Error(ERR_NO_MIME)

                            if ( err )
                              reject(err)
                            else
                              resolve({ extensions })
                        })
                    })
                })
                .catch(e => {
                    return { error: e }
                })
                .then(({error, extensions}) => {
                    cb.apply(null, !!error?[error]:[null, ...extensions])

                    return extensions
                })
            }
        }
      , reverseLookup: { enumerable: true,
            get: () => module.exports.Mime.reverse_lookup
        }
    })

    return {
        constructor: function(filepath){
            mimes.set(this, new Map)
            mimes.get(this).set("filepath", filepath)
        }
      , lookup: { enumerable: true,
            value: function(cb){
                return module.exports.Mime.lookup(mimes.get(this).get("filepath"), cb)
            }
        }

    }
})
